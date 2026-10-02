-- Disposable PostgreSQL acceptance only. Never run against a business project.
begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*'])
on conflict(user_id) do update set active=true,permissions=array['*'];
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000071','Smart Item terminal','DESKTOP');
reset role;
update servos_v2.control set enabled=true,authority_mode='SHARED_V2';
select servos_v2.put_record('outlets','smart-outlet',jsonb_build_object('name','Smart Item Outlet','active',true));
select public.servos_v2_execute(jsonb_build_object(
 'id','20000000-0000-4000-8000-000000000071','schemaVersion',2,
 'deviceId','10000000-0000-4000-8000-000000000071','actorId',auth.uid(),
 'clientSequence',1,'operation','stockLocation.save','payload',jsonb_build_object(
  'id','smart-main','data',jsonb_build_object('name','Smart Item Store','code','SMART-MAIN','type','STORE')),
 'expectedVersions',jsonb_build_array(jsonb_build_object('collection','stockLocations','id','smart-main','version',0))
));

do $$declare command_key text:='20000000-0000-4000-8000-000000000072';command_data jsonb;result jsonb;replayed jsonb;stock_data jsonb;product_data jsonb;movement_data jsonb;begin
 command_data:=jsonb_build_object(
  'id',command_key,'schemaVersion',2,'deviceId','10000000-0000-4000-8000-000000000071',
  'actorId',auth.uid(),'clientSequence',2,'operation','catalog.createWithOpeningStock',
  'payload',jsonb_build_object(
   'product',jsonb_build_object('id','smart-product-id','name','Smart Soda','code','SMART-SODA','price',2.5,'category','DRINKS','inventoryType','DRINK','routeTo','BAR','stockItemId','','outletIds',jsonb_build_array('smart-outlet'),'taxClassId','A_STANDARD','favorite',false,'barcode','','portionVolume',1,'portions',jsonb_build_array(jsonb_build_object('id','each','name','Each','volume',1,'priceMinor',250)),'recipeIngredients','[]'::jsonb,'modifiers','[]'::jsonb),
   'stockItem',jsonb_build_object('id','smart-stock-id','name','Smart Soda stock','code','SMART-SODA-STOCK','barcode','','baseUnit','piece','scanUnitQuantity',24,'purchasePackages',jsonb_build_array(jsonb_build_object('id','case-24','name','Case','unitsPerPackage',24,'baseQuantity',24,'baseUnit','piece')),'averageUnitCost',0.1,'reorderLevel',0),
   'locationId','smart-main','startingQuantity',48,'openingMovementId','smart-opening-id'),
  'expectedVersions',jsonb_build_array(
   jsonb_build_object('collection','stockItems','id','smart-stock-id','version',0),
   jsonb_build_object('collection','products','id','smart-product-id','version',0),
   jsonb_build_object('collection','stockMovements','id','smart-opening-id','version',0),
   jsonb_build_object('collection','stockLocations','id','smart-main','version',(select version from servos_v2.records where collection='stockLocations' and id='smart-main')),
   jsonb_build_object('collection','outlets','id','smart-outlet','version',(select version from servos_v2.records where collection='outlets' and id='smart-outlet'))
  ));
 result:=public.servos_v2_execute(command_data);
 if result->>'status'<>'SYNCHRONIZED' then raise exception 'Smart Item transaction rejected: %',result;end if;
 replayed:=public.servos_v2_execute(command_data);
 if replayed<>result then raise exception 'Smart Item command replay changed its acknowledgement';end if;
 select data into stock_data from servos_v2.records where collection='stockItems' and id='smart-stock-id';
 select data into product_data from servos_v2.records where collection='products' and id='smart-product-id';
 select data into movement_data from servos_v2.records where collection='stockMovements' and id='smart-opening-id';
 if stock_data is null or product_data is null or movement_data is null then raise exception 'Smart Item did not create all expected records';end if;
 if stock_data->'currentStock'->>'smart-main'<>'48' or stock_data->>'averageUnitCostMinor'<>'10' then raise exception 'Smart Item stock quantity/cost conversion is incorrect: %',stock_data;end if;
 if product_data->>'stockItemId'<>'smart-stock-id' or product_data->>'priceMinor'<>'250' or product_data->'portions'->0->>'priceMinor'<>'250' then raise exception 'Smart Item product link/price is incorrect: %',product_data;end if;
 if movement_data->>'movementType'<>'OPENING_BALANCE' or movement_data->>'quantityDelta'<>'48' then raise exception 'Smart Item immutable opening movement is incorrect: %',movement_data;end if;
end$$;

do $$declare command_data jsonb;result jsonb;recipe_product jsonb;begin
 command_data:=jsonb_build_object(
  'id','20000000-0000-4000-8000-000000000075','schemaVersion',2,
  'deviceId','10000000-0000-4000-8000-000000000071','actorId',auth.uid(),'clientSequence',3,
  'operation','product.save','payload',jsonb_build_object(
   'id','smart-recipe-product','data',jsonb_build_object(
    'id','smart-recipe-product','name','Smart Recipe Bowl','code','SMART-RECIPE-BOWL','priceMinor',450,
    'category','FOOD','inventoryType','DISH','routeTo','KITCHEN','taxClassId','A_STANDARD',
    'outletIds',jsonb_build_array('smart-outlet'),
    'recipeIngredients',jsonb_build_array(jsonb_build_object('stockItemId','smart-stock-id','quantity',2,'tracked',true)))),
  'expectedVersions',jsonb_build_array(
   jsonb_build_object('collection','products','id','smart-recipe-product','version',0),
   jsonb_build_object('collection','stockItems','id','smart-stock-id','version',(select version from servos_v2.records where collection='stockItems' and id='smart-stock-id')),
   jsonb_build_object('collection','outlets','id','smart-outlet','version',(select version from servos_v2.records where collection='outlets' and id='smart-outlet'))));
 result:=public.servos_v2_execute(command_data);
 if result->>'status'<>'SYNCHRONIZED' then raise exception 'Recipe product rejected: %',result;end if;
 select data into recipe_product from servos_v2.records where collection='products' and id='smart-recipe-product';
 if recipe_product->>'stockItemId' is not null or recipe_product->'recipeIngredients'->0->>'stockItemId'<>'smart-stock-id' or recipe_product->'recipeIngredients'->0->>'quantity'<>'2' then raise exception 'Recipe product lost its validated ingredients: %',recipe_product;end if;

 command_data:=jsonb_set(command_data,'{id}','"20000000-0000-4000-8000-000000000076"'::jsonb);
 command_data:=jsonb_set(command_data,'{clientSequence}','4'::jsonb);
 command_data:=jsonb_set(command_data,'{payload,id}','"stale-recipe-product"'::jsonb);
 command_data:=jsonb_set(command_data,'{payload,data,id}','"stale-recipe-product"'::jsonb);
 command_data:=jsonb_set(command_data,'{payload,data,name}','"Stale Recipe Bowl"'::jsonb);
 command_data:=jsonb_set(command_data,'{payload,data,code}','"STALE-RECIPE-BOWL"'::jsonb);
 command_data:=jsonb_set(command_data,'{expectedVersions,0,id}','"stale-recipe-product"'::jsonb);
 command_data:=jsonb_set(command_data,'{expectedVersions,1,version}','0'::jsonb);
 result:=public.servos_v2_execute(command_data);
 if result->>'status'<>'CONFLICT' or result->'error'->>'code'<>'VERSION_CONFLICT' then raise exception 'Stale recipe stock baseline did not conflict as expected: %',result;end if;
 if exists(select 1 from servos_v2.records where collection='products' and id='stale-recipe-product') then raise exception 'Rejected stale recipe created a product';end if;

 update servos_v2.members set permissions=array['records.view','catalog.manage'] where user_id=auth.uid();
 command_data:=jsonb_set(command_data,'{id}','"20000000-0000-4000-8000-000000000077"'::jsonb);
 command_data:=jsonb_set(command_data,'{clientSequence}','5'::jsonb);
 command_data:=jsonb_set(command_data,'{payload,id}','"denied-recipe-product"'::jsonb);
 command_data:=jsonb_set(command_data,'{payload,data,id}','"denied-recipe-product"'::jsonb);
 command_data:=jsonb_set(command_data,'{payload,data,name}','"Denied Recipe Bowl"'::jsonb);
 command_data:=jsonb_set(command_data,'{payload,data,code}','"DENIED-RECIPE-BOWL"'::jsonb);
 command_data:=jsonb_set(command_data,'{expectedVersions,0,id}','"denied-recipe-product"'::jsonb);
 command_data:=jsonb_set(command_data,'{expectedVersions,1,version}',to_jsonb((select version from servos_v2.records where collection='stockItems' and id='smart-stock-id')));
 result:=public.servos_v2_execute(command_data);
 if result->>'status'<>'REJECTED' or result->'error'->>'code'<>'PERMISSION_DENIED' then raise exception 'Recipe without inventory.view was not denied: %',result;end if;
 if exists(select 1 from servos_v2.records where collection='products' and id='denied-recipe-product') then raise exception 'Permission-rejected recipe created a product';end if;
 update servos_v2.members set permissions=array['*'] where user_id=auth.uid();
end$$;

do $$declare command_data jsonb;result jsonb;stock_data jsonb;product_data jsonb;movement_data jsonb;begin
 command_data:=jsonb_build_object(
  'id','20000000-0000-4000-8000-000000000078','schemaVersion',2,
  'deviceId','10000000-0000-4000-8000-000000000071','actorId',auth.uid(),'clientSequence',6,
  'operation','catalog.createWithOpeningStock','payload',jsonb_build_object(
   'product',jsonb_build_object('id','sealed-product','name','Smart Gin','code','SMART-GIN','price',1.5,'category','SPIRITS','inventoryType','SPIRIT','routeTo','BAR','stockItemId','','outletIds',jsonb_build_array('smart-outlet'),'taxClassId','A_STANDARD','portionVolume',750,'portions',jsonb_build_array(jsonb_build_object('id','serving','name','Pour','volume',45,'priceMinor',150),jsonb_build_object('id','whole-container','name','Whole bottle','volume',750,'priceMinor',2500)),'recipeIngredients','[]'::jsonb,'modifiers','[]'::jsonb),
   'stockItem',jsonb_build_object('id','sealed-stock','name','Smart Gin stock','code','SMART-GIN-STOCK','baseUnit','ml','scanUnitQuantity',9000,'purchasePackages',jsonb_build_array(jsonb_build_object('id','gin-case','name','Case','unitsPerPackage',12,'baseQuantity',9000,'baseUnit','ml')),'averageUnitCost',1.333333,'sealedContainerSize',750,'reorderLevel',0),
   'locationId','smart-main','startingQuantity',9000,'openingMovementId','sealed-opening-movement'),
  'expectedVersions',jsonb_build_array(
   jsonb_build_object('collection','stockItems','id','sealed-stock','version',0),
   jsonb_build_object('collection','products','id','sealed-product','version',0),
   jsonb_build_object('collection','stockMovements','id','sealed-opening-movement','version',0),
   jsonb_build_object('collection','stockLocations','id','smart-main','version',(select version from servos_v2.records where collection='stockLocations' and id='smart-main')),
   jsonb_build_object('collection','outlets','id','smart-outlet','version',(select version from servos_v2.records where collection='outlets' and id='smart-outlet'))));
 result:=public.servos_v2_execute(command_data);
 if result->>'status'<>'SYNCHRONIZED' then raise exception 'Sealed bottle Smart Item rejected: %',result;end if;
 select data into stock_data from servos_v2.records where collection='stockItems' and id='sealed-stock';
 select data into product_data from servos_v2.records where collection='products' and id='sealed-product';
 select data into movement_data from servos_v2.records where collection='stockMovements' and id='sealed-opening-movement';
 if (stock_data->>'sealedContainerSize')::numeric<>750 or (stock_data->'currentStock'->>'smart-main')::numeric<>9000 or (stock_data->'sealedOpenStock'->'smart-main'->>'sealedContainers')::numeric<>12 or (stock_data->'sealedOpenStock'->'smart-main'->>'openQuantity')::numeric<>0 then raise exception 'Opening stock did not initialize sealed bottles: %',stock_data;end if;
 if (product_data->>'portionVolume')::numeric<>750 or (product_data->'portions'->0->>'volume')::numeric<>45 or (product_data->'portions'->1->>'volume')::numeric<>750 or (product_data->'portions'->1->>'priceMinor')::numeric<>2500 then raise exception 'Spirit serving/whole-bottle portions were not preserved: %',product_data;end if;
 if (movement_data->'sealedOpenAfter'->>'sealedContainers')::numeric<>12 then raise exception 'Opening movement omitted sealed-bottle state: %',movement_data;end if;
end$$;

do $$declare command_data jsonb;result jsonb;begin
 -- A duplicate product found after the stock master has been staged must roll
 -- the entire command back, including the new stock row and opening movement.
 command_data:=jsonb_build_object(
  'id','20000000-0000-4000-8000-000000000073','schemaVersion',2,
  'deviceId','10000000-0000-4000-8000-000000000071','actorId',auth.uid(),'clientSequence',7,
  'operation','catalog.createWithOpeningStock',
  'payload',jsonb_build_object(
   'product',jsonb_build_object('id','','name','Duplicate Smart Soda','code','SMART-SODA','price',3,'routeTo','BAR','outletIds',jsonb_build_array('smart-outlet'),'taxClassId','A_STANDARD'),
   'stockItem',jsonb_build_object('name','Rollback Stock','code','ROLLBACK-STOCK','baseUnit','piece','scanUnitQuantity',1,'purchasePackages','[]'::jsonb,'averageUnitCost',0,'reorderLevel',0),
   'locationId','smart-main','startingQuantity',5),
  'expectedVersions',jsonb_build_array(
   jsonb_build_object('collection','stockItems','id','20000000-0000-4000-8000-000000000073','version',0),
   jsonb_build_object('collection','products','id','20000000-0000-4000-8000-000000000073:product','version',0),
   jsonb_build_object('collection','stockMovements','id','20000000-0000-4000-8000-000000000073:opening','version',0),
   jsonb_build_object('collection','stockLocations','id','smart-main','version',(select version from servos_v2.records where collection='stockLocations' and id='smart-main')),
   jsonb_build_object('collection','outlets','id','smart-outlet','version',(select version from servos_v2.records where collection='outlets' and id='smart-outlet'))
  ));
 result:=public.servos_v2_execute(command_data);
 if result->>'status'<>'REJECTED' or result->'error'->>'code'<>'DUPLICATE_REFERENCE' then raise exception 'Duplicate Smart Item code was not rejected: %',result;end if;
 if exists(select 1 from servos_v2.records where collection='stockItems' and id='20000000-0000-4000-8000-000000000073') or exists(select 1 from servos_v2.records where collection='stockMovements' and id='20000000-0000-4000-8000-000000000073:opening') then raise exception 'Rejected Smart Item left partial stock or movement rows';end if;

 update servos_v2.members set permissions=array['records.view'] where user_id=auth.uid();
 command_data:=jsonb_build_object(
  'id','20000000-0000-4000-8000-000000000074','schemaVersion',2,
  'deviceId','10000000-0000-4000-8000-000000000071','actorId',auth.uid(),'clientSequence',8,
  'operation','catalog.createWithOpeningStock',
  'payload',jsonb_build_object('stockItem',jsonb_build_object('name','Denied Stock','code','DENIED-STOCK','baseUnit','piece','scanUnitQuantity',1,'purchasePackages','[]'::jsonb,'averageUnitCost',0,'reorderLevel',0),'locationId','smart-main','startingQuantity',0),
  'expectedVersions',jsonb_build_array(
   jsonb_build_object('collection','stockItems','id','20000000-0000-4000-8000-000000000074','version',0),
   jsonb_build_object('collection','stockLocations','id','smart-main','version',(select version from servos_v2.records where collection='stockLocations' and id='smart-main'))
  ));
 result:=public.servos_v2_execute(command_data);
 if result->>'status'<>'REJECTED' or result->'error'->>'code'<>'PERMISSION_DENIED' then raise exception 'Smart Item permission was not enforced: %',result;end if;
 if exists(select 1 from servos_v2.records where collection='stockItems' and id='20000000-0000-4000-8000-000000000074') then raise exception 'Permission-rejected Smart Item created a stock record';end if;
end$$;

rollback;
