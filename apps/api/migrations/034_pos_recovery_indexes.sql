-- Open obligations and unfinished preparation must survive bootstrap history caps.
CREATE INDEX pos_orders_closed_history ON pos_orders(business_id,updated_at DESC,id)
 WHERE state IN ('COMPLETED','VOIDED');
CREATE INDEX pos_order_lines_pending_preparation ON pos_order_lines(business_id,order_id)
 WHERE state='FIRED' AND preparation_status IN ('FIRED','PREPARING','READY');
