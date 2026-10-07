use crate::journal::PrintJournal;
use fs2::FileExt;
use std::fs::{File,OpenOptions};
use std::path::{Path,PathBuf};

/// Holds the OS-backed exclusive journal lock for the entire bridge writer lifetime.
/// The lock file remains on disk; its existence is never treated as a live process.
/// Process exit releases the actual lock, allowing deterministic crash recovery.
pub struct BridgeSession {
 journal:PrintJournal,
 _lock:File,
 journal_path:PathBuf,
 recovered_attempts:usize,
}
impl BridgeSession {
 pub fn open(path:&Path)->Result<Self,String>{
  if path.as_os_str().is_empty()||path==Path::new(":memory:"){return Err("Bridge delivery requires a persistent journal file".into());}
  let absolute=if path.is_absolute(){path.to_path_buf()}else{std::env::current_dir().map_err(|e|e.to_string())?.join(path)};
  let journal_path=if absolute.exists(){absolute.canonicalize().map_err(|e|e.to_string())?}else{
   let parent=absolute.parent().ok_or("Journal needs a parent directory")?.canonicalize().map_err(|e|e.to_string())?;
   let name=absolute.file_name().ok_or("Journal needs a file name")?;
   parent.join(name)
  };
  let name=journal_path.file_name().ok_or("Journal needs a file name")?;
  let mut lock_name=name.to_os_string();lock_name.push(".lock");
  let lock_path=journal_path.with_file_name(lock_name);
  let lock=OpenOptions::new().read(true).write(true).create(true).truncate(false).open(lock_path).map_err(|e|format!("Cannot open bridge journal lock: {e}"))?;
  FileExt::try_lock_exclusive(&lock).map_err(|_|"Another bridge writer holds this journal. Do not recover or resend its active jobs.".to_string())?;
  // No schema mutation or recovery runs before the exclusive OS lock is held.
  let mut journal=PrintJournal::open(&journal_path)?;
  let recovered_attempts=journal.recover_interrupted_sends()?;
  Ok(Self{journal,_lock:lock,journal_path,recovered_attempts})
 }
 pub fn journal(&self)->&PrintJournal{&self.journal}
 pub fn journal_mut(&mut self)->&mut PrintJournal{&mut self.journal}
 pub fn journal_path(&self)->&Path{&self.journal_path}
 pub fn recovered_attempts(&self)->usize{self.recovered_attempts}
}
