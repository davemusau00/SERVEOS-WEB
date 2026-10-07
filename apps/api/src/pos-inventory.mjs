import {ApiProblem} from './command-kernel.mjs';

const invalid=message=>{throw new ApiProblem(409,'INVALID_STOCK_CONFIGURATION',message)};
const units={kg:['mass',1000],g:['mass',1],l:['liquid',1000],ml:['liquid',1],unit:['count',1],piece:['count',1],portion:['portion',1]};
const precise=value=>{
 if(!Number.isFinite(value)||value<=0||value>1_000_000_000||Math.abs(value*1_000_000-Math.round(value*1_000_000))>0.0001)invalid('Stock consumption exceeds supported quantity or precision.');
 return Number(value.toFixed(6));
};

export async function consumptionSnapshot(db,businessId,product,portion,recipe){
 let ingredients=product.inventoryType==='BATCH'?[]:recipe;
 const direct=ingredients.length===0;
 if(direct&&product.stockItemId)ingredients=[{stockItemId:product.stockItemId,quantity:portion?.volume??product.portionVolume??1,unit:''}];
 if(product.inventoryType==='BATCH'&&!product.stockItemId)invalid('Batch product requires linked finished stock.');
 if(!ingredients.length){if(portion?.wholeContainerSale===true)invalid('Whole-container portions require linked bottle-tracked stock.');if(['STOCKED','RECIPE','BATCH','WINE','SPIRIT','COUNT','WEIGHT'].includes(product.inventoryType)||product.sellingMode)invalid('Tracked products require a stock item or recipe before selling.');return [];}
 const ids=[...new Set(ingredients.map(row=>row.stockItemId))];
 const {rows}=await db.query('SELECT id,base_unit AS "baseUnit",sealed_container_size AS "containerSize" FROM stock_items WHERE business_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL FOR SHARE',[businessId,ids]);
 if(rows.length!==ids.length)invalid('A product ingredient is missing or archived.');
 return ingredients.map(ingredient=>{
  const stock=rows.find(row=>row.id===ingredient.stockItemId),baseUnit=stock.baseUnit;
  const from=String(ingredient.unit||baseUnit).toLowerCase(),to=baseUnit.toLowerCase();
  let per=Number(ingredient.quantity);
  if(from!==to){if(!units[from]||!units[to]||units[from][0]!==units[to][0])invalid('Recipe ingredient units do not match its stock unit.');per=per*units[from][1]/units[to][1];}
  per=precise(per);
  const containerSize=stock.containerSize===null?null:Number(stock.containerSize);
  const measured=direct&&(product.sellingMode||['SPIRIT','WINE'].includes(product.inventoryType));
  const wholeContainerSale=Boolean(measured&&containerSize!==null&&(portion?.wholeContainerSale===true||Math.abs(per-containerSize)<0.000001));
  if(portion?.wholeContainerSale===true&&!wholeContainerSale)invalid('A whole-container portion must consume linked bottle-tracked stock with its configured container size.');
  if(product.sellingMode==='BOTTLE_ONLY'&&!wholeContainerSale)invalid('Bottle-only products require a whole-container portion.');
  if(containerSize!==null&&baseUnit!=='ml')invalid('Bottle-tracked stock must use ml.');
  if(wholeContainerSale&&Math.abs(per/containerSize-Math.round(per/containerSize))>0.000001)invalid('Whole-bottle portions must contain whole sealed containers.');
  return {stockItemId:stock.id,quantity:per,baseUnit,containerSize,wholeContainerSale};
 });
}

/** Whole bottles are reserved first; measured liquid opens sealed stock only as needed. */
export function consumePhysical(stock,before,wholeQuantity,measuredQuantity){
 const consumed=precise(wholeQuantity+measuredQuantity);
 if(before.quantity+0.000001<consumed)throw new ApiProblem(409,'INSUFFICIENT_STOCK','There is not enough stock to fire this order.');
 const quantity=Number((before.quantity-consumed).toFixed(6));
 if(stock.sealedContainerSize===null)return {quantity,sealedContainers:null,openQuantity:null};
 const size=stock.sealedContainerSize;
 if(before.sealedContainers===null||before.openQuantity===null||Math.abs(before.sealedContainers*size+before.openQuantity-before.quantity)>0.000001)throw new ApiProblem(409,'PHYSICAL_STATE_REQUIRED','Record a physical bottle count before firing this stock.');
 const whole=wholeQuantity/size;
 if(Math.abs(whole-Math.round(whole))>0.000001||whole>before.sealedContainers)throw new ApiProblem(409,'INSUFFICIENT_SEALED_STOCK','There are not enough sealed bottles for whole-container sales.');
 let sealed=before.sealedContainers-Math.round(whole),open=before.openQuantity;
 if(measuredQuantity>open){const opened=Math.ceil((measuredQuantity-open)/size);if(opened>sealed)throw new ApiProblem(409,'INSUFFICIENT_STOCK','There is not enough bottle stock to serve this order.');sealed-=opened;open+=opened*size;}
 open=Number((open-measuredQuantity).toFixed(6));
 if(open<0||open>=size||sealed<0||Math.abs(sealed*size+open-quantity)>0.000001)invalid('Bottle consumption did not conserve physical stock.');
 return {quantity,sealedContainers:sealed,openQuantity:open};
}
