import type { ImportTemplateKey } from '../types/imports';

export interface ImportTemplateDefinition {
  key: ImportTemplateKey;
  label: string;
  group: 'Business setup' | 'Inventory & catalog' | 'Rooms / PMS' | 'Assets';
  fileName: string;
  headers: string[];
  csv: string;
}

export const IMPORT_TEMPLATES: ImportTemplateDefinition[] = [
  {
    "key": "business",
    "label": "Business identity",
    "group": "Business setup",
    "fileName": "business.csv",
    "headers": [
      "external_id",
      "trading_name",
      "legal_name",
      "registration_number",
      "kra_pin",
      "phone",
      "email",
      "address",
      "currency",
      "timezone"
    ],
    "csv": "external_id,trading_name,legal_name,registration_number,kra_pin,phone,email,address,currency,timezone\r\nbusiness-main,Kitulis Bar & Grill,Kitulis Bar & Grill Ltd,CPR/2024/123456,P051234567X,+254700000000,hello@example.co.ke,\"Nairobi, Kenya\",KES,Africa/Nairobi\r\n"
  },
  {
    "key": "outlets",
    "label": "Outlets",
    "group": "Business setup",
    "fileName": "outlets.csv",
    "headers": [
      "external_id",
      "name",
      "type",
      "phone",
      "address",
      "default_stock_location_external_id",
      "active"
    ],
    "csv": "external_id,name,type,phone,address,default_stock_location_external_id,active\r\noutlet-main,Main Bar,BAR,+254700000000,Ground Floor,stock-main,true\r\n"
  },
  {
    "key": "stock_locations",
    "label": "Stock locations",
    "group": "Inventory & catalog",
    "fileName": "stock_locations.csv",
    "headers": [
      "external_id",
      "name",
      "outlet_external_id",
      "kind",
      "active"
    ],
    "csv": "external_id,name,outlet_external_id,kind,active\r\nstock-main,Main Store,,MAIN,true\r\n"
  },
  {
    "key": "suppliers",
    "label": "Suppliers",
    "group": "Business setup",
    "fileName": "suppliers.csv",
    "headers": [
      "external_id",
      "name",
      "contact_person",
      "phone",
      "email",
      "kra_pin",
      "payment_terms_days",
      "active"
    ],
    "csv": "external_id,name,contact_person,phone,email,kra_pin,payment_terms_days,active\r\nsupplier-001,Example Beverages Ltd,Jane Supplier,+254711000000,accounts@supplier.example,P051111111A,30,true\r\n"
  },
  {
    "key": "customers",
    "label": "Customers",
    "group": "Business setup",
    "fileName": "customers.csv",
    "headers": [
      "external_id",
      "name",
      "phone",
      "email",
      "credit_limit",
      "notes",
      "active"
    ],
    "csv": "external_id,name,phone,email,credit_limit,notes,active\r\ncustomer-001,Example Customer,+254722000000,customer@example.com,0,Opening customer record,true\r\n"
  },
  {
    "key": "employees",
    "label": "Employees",
    "group": "Business setup",
    "fileName": "employees.csv",
    "headers": [
      "external_id",
      "full_name",
      "job_title",
      "role",
      "phone",
      "email",
      "active"
    ],
    "csv": "external_id,full_name,job_title,role,phone,email,active\r\nemployee-001,Example Manager,Duty Manager,MANAGER,+254733000000,manager@example.com,true\r\n"
  },
  {
    "key": "products",
    "label": "Products",
    "group": "Inventory & catalog",
    "fileName": "products.csv",
    "headers": [
      "external_id",
      "code",
      "name",
      "category",
      "barcode",
      "selling_price",
      "taxable",
      "route_to",
      "outlet_external_ids",
      "stock_item_external_id",
      "active"
    ],
    "csv": "external_id,code,name,category,barcode,selling_price,taxable,route_to,outlet_external_ids,stock_item_external_id,active\r\nproduct-001,COKE300,Coca-Cola 300ml,Soft Drinks,616110000001,120.00,true,BAR,outlet-main,stock-coke300,true\r\n"
  },
  {
    "key": "inventory",
    "label": "Opening inventory",
    "group": "Inventory & catalog",
    "fileName": "inventory.csv",
    "headers": [
      "external_id",
      "stock_item_external_id",
      "stock_item_name",
      "code",
      "barcode",
      "base_unit",
      "location_external_id",
      "opening_quantity",
      "average_unit_cost",
      "reorder_level"
    ],
    "csv": "external_id,stock_item_external_id,stock_item_name,code,barcode,base_unit,location_external_id,opening_quantity,average_unit_cost,reorder_level\r\ninventory-001,stock-coke300,Coca-Cola 300ml,COKE300,616110000001,bottle,stock-main,24,65.00,12\r\n"
  },
  {
    "key": "room_types",
    "label": "Room types",
    "group": "Rooms / PMS",
    "fileName": "room_types.csv",
    "headers": [
      "external_id",
      "name",
      "code",
      "capacity_adults",
      "capacity_children",
      "base_rate",
      "active"
    ],
    "csv": "external_id,name,code,capacity_adults,capacity_children,base_rate,active\r\nroomtype-standard,Standard Room,STD,2,1,6500.00,true\r\n"
  },
  {
    "key": "rooms",
    "label": "Rooms",
    "group": "Rooms / PMS",
    "fileName": "rooms.csv",
    "headers": [
      "external_id",
      "room_number",
      "room_type_external_id",
      "floor",
      "wing",
      "initial_status",
      "active"
    ],
    "csv": "external_id,room_number,room_type_external_id,floor,wing,initial_status,active\r\nroom-101,101,roomtype-standard,1,Main,READY,true\r\n"
  },
  {
    "key": "rate_plans",
    "label": "Rate plans",
    "group": "Rooms / PMS",
    "fileName": "rate_plans.csv",
    "headers": [
      "external_id",
      "name",
      "room_type_external_id",
      "meal_plan",
      "currency",
      "nightly_rate",
      "min_nights",
      "max_nights",
      "active"
    ],
    "csv": "external_id,name,room_type_external_id,meal_plan,currency,nightly_rate,min_nights,max_nights,active\r\nrate-standard-bb,Standard BB,roomtype-standard,BB,KES,7500.00,1,30,true\r\n"
  },
  {
    "key": "hotel_services",
    "label": "Hotel services",
    "group": "Rooms / PMS",
    "fileName": "hotel_services.csv",
    "headers": [
      "external_id",
      "code",
      "name",
      "category",
      "unit_price",
      "taxable",
      "active"
    ],
    "csv": "external_id,code,name,category,unit_price,taxable,active\r\nservice-laundry,LAUNDRY,Laundry Service,LAUNDRY,500.00,true,true\r\n"
  },
  {
    "key": "asset_categories",
    "label": "Asset categories",
    "group": "Assets",
    "fileName": "asset_categories.csv",
    "headers": [
      "external_id",
      "name",
      "code",
      "depreciation_method",
      "useful_life_months",
      "active"
    ],
    "csv": "external_id,name,code,depreciation_method,useful_life_months,active\r\nassetcat-electronics,Electronics,ELEC,STRAIGHT_LINE,60,true\r\n"
  },
  {
    "key": "assets",
    "label": "Assets",
    "group": "Assets",
    "fileName": "assets.csv",
    "headers": [
      "external_id",
      "asset_tag",
      "name",
      "category_external_id",
      "serial_number",
      "location_external_id",
      "acquisition_date",
      "acquisition_cost",
      "status",
      "notes"
    ],
    "csv": "external_id,asset_tag,name,category_external_id,serial_number,location_external_id,acquisition_date,acquisition_cost,status,notes\r\nasset-tv-001,TV-001,Guest Room Smart TV,assetcat-electronics,SN-EXAMPLE-001,room-101,2026-01-15,45000.00,IN_SERVICE,Example asset row\r\n"
  }
] as ImportTemplateDefinition[];

export const IMPORT_TEMPLATE_GROUPS = ['Business setup','Inventory & catalog','Rooms / PMS','Assets'] as const;
