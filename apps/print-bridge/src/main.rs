//! Private line-delimited worker for the local HTTPS host. Never expose stdin over a socket.
use serde::Deserialize;
use serde_json::json;
use servos_print_bridge::{auth::SignedRequest,config::ApprovedConfiguration,BridgeSession};
use std::{io::{self,BufRead,Read,Write},path::PathBuf};

#[derive(Deserialize)]
#[serde(tag="operation",rename_all="SCREAMING_SNAKE_CASE",rename_all_fields="camelCase",deny_unknown_fields)]
enum Operation {
 Preflight{http_origin:String},
 Dispatch{http_origin:String,request:SignedRequest},
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Message {message_id:String,operation:Operation}
fn run()->Result<(),String>{
 let args:Vec<_>=std::env::args_os().skip(1).collect();
 if args.len()!=2{return Err("Usage: servos-print-bridge <approved-config-path> <journal-path>".into());}
 let config_path=PathBuf::from(&args[0]);let journal_path=PathBuf::from(&args[1]);
 // Refuse startup before journal mutation if approved configuration is invalid.
 ApprovedConfiguration::read_installer_file(&config_path)?;
 let mut session=BridgeSession::open(&journal_path)?;
 let stdin=io::stdin();let mut input=stdin.lock();let stdout=io::stdout();let mut output=stdout.lock();
 loop{
  let mut bytes=Vec::new();
  let length=(&mut input).take(8*1024*1024+1).read_until(b'\n',&mut bytes).map_err(|_|"Cannot read host message")?;
  if length==0{return Ok(());}
  if length>8*1024*1024||bytes.last()!=Some(&b'\n'){return Err("Host message is oversized or incomplete".into());}
  let message:Message=serde_json::from_slice(&bytes).map_err(|_|"Malformed private host message")?;
  let id=uuid::Uuid::parse_str(&message.message_id).map_err(|_|"Invalid host message identity")?;
  if id.to_string()!=message.message_id{return Err("Invalid host message identity".into());}
  // Reload synchronously for every request; invalid replacement never falls back to stale grants.
  let result=ApprovedConfiguration::read_installer_file(&config_path).and_then(|config|match message.operation{
   Operation::Preflight{http_origin}=>Ok(json!({"permitted":config.permits_origin(&http_origin)})),
   Operation::Dispatch{http_origin,request}=>{
    let response=config.dispatch(&mut session,&http_origin,request)?;
    serde_json::from_str::<serde_json::Value>(&response).map_err(|_|"Invalid saved application response".into())
   },
  });
  let response=match result{
   Ok(body)=>json!({"messageId":message.message_id,"ok":true,"body":body}),
   Err(_)=>json!({"messageId":message.message_id,"ok":false,"code":"BRIDGE_REQUEST_REFUSED_OR_UNRESOLVED"}),
  };
  serde_json::to_writer(&mut output,&response).map_err(|_|"Cannot write host response")?;
  output.write_all(b"\n").map_err(|_|"Cannot write host response")?;
  output.flush().map_err(|_|"Cannot flush host response")?;
 }
}
fn main(){if let Err(message)=run(){eprintln!("{message}");std::process::exit(1);}}
