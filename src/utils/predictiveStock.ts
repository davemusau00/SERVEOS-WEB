/**
 * ServOS - Predictive Inventory Forecasting & Dynamic Reorder Point (ROP) Engine
 * Analyzes historical stock movement consumption velocity, supplier lead times,
 * and safety stock buffers to forecast stockout risk and calculate dynamic reorder thresholds.
 */

import { StockItem, StockMovement } from '../types/servos';

export interface PredictiveStockAnalysis {
  stockItemId: string;
  code: string;
  name: string;
  category: string;
  baseUnit: string;
  currentStockTotal: number;
  staticReorderPoint: number;
  parLevel: number;
  averageUnitCost: number;
  averageDailyConsumption: number; // e.g. ml or units per day
  leadTimeDays: number;
  leadTimeDemand: number;
  safetyStock: number;
  dynamicReorderPoint: number;
  daysOfInventoryRemaining: number;
  urgencyLevel: 'CRITICAL' | 'WARNING' | 'HEALTHY' | 'OVERSTOCKED';
  urgencyMessage: string;
  suggestedReorderQuantity: number;
  stockoutProjectedDate: string;
  estimatedReplenishmentCost: number;
  historicalMovementCount: number;
  supplierName?: string;
}

/**
 * Calculates predictive stock analytics for all inventory stock items
 */
export const calculatePredictiveInventory = (
  stockItems: StockItem[],
  stockMovements: StockMovement[]
): PredictiveStockAnalysis[] => {
  const now = new Date();
  
  // Default supplier lead times per category in days (standard hospitality benchmark)
  const categoryLeadTimes: Record<string, number> = {
    'SPIRITS': 3,
    'BEER': 2,
    'WINE': 4,
    'CHAMPAGNE': 5,
    'MIXERS': 1,
    'SYRUPS': 3,
    'GARNISH': 1,
    'DAIRY': 1,
    'DEFAULT': 3
  };

  return stockItems.map(item => {
    const totalCurrentUnits = Object.values(item.currentStock).reduce((acc, qty) => acc + qty, 0);
    const leadTime = categoryLeadTimes[item.category.toUpperCase()] || categoryLeadTimes.DEFAULT;

    // Filter relevant historical consumption movements (Sales, Comps, Waste, Production)
    const consumptionMovements = stockMovements.filter(
      m => m.stockItemId === item.id && 
      (m.movementType === 'SALE_CONSUMPTION' || 
       m.movementType === 'COMP_CONSUMPTION' || 
       m.movementType === 'WASTE' ||
       m.movementType === 'PRODUCTION_INPUT')
    );

    // Calculate total consumed quantity and span of activity
    let totalConsumed = 0;
    let earliestTimestamp = now.getTime();

    consumptionMovements.forEach(m => {
      totalConsumed += Math.abs(m.quantityDelta);
      const mTime = new Date(m.occurredAt).getTime();
      if (mTime < earliestTimestamp) {
        earliestTimestamp = mTime;
      }
    });

    // Compute activity span in days (minimum 7 days baseline for smoothing run-rates)
    const daysSpan = Math.max(7, Math.ceil((now.getTime() - earliestTimestamp) / (1000 * 60 * 60 * 24)));
    
    // Average Daily Consumption (ADC) with fallback baseline based on par level velocity
    let adc = totalConsumed > 0 ? totalConsumed / daysSpan : (item.parLevel * 0.08);
    adc = Math.max(0.1, Math.round(adc * 100) / 100);

    // Lead Time Demand (LTD) = ADC * Lead Time Days
    const leadTimeDemand = Math.round(adc * leadTime * 10) / 10;

    // Safety Stock (SS) = 50% buffer on Lead Time Demand to protect against weekend demand spikes
    const safetyStock = Math.max(Math.ceil(leadTimeDemand * 0.5), Math.ceil(item.parLevel * 0.15));

    // Dynamic Reorder Point (Dynamic ROP) = LTD + SS
    const dynamicReorderPoint = Math.ceil(leadTimeDemand + safetyStock);

    // Days of Inventory Remaining (DIR)
    const daysRemaining = adc > 0 
      ? Math.round((totalCurrentUnits / adc) * 10) / 10 
      : 999;

    // Stockout Projected Date
    const stockoutDate = new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000);
    const stockoutFormatted = daysRemaining > 180 
      ? 'Well Stocked (>6 mos)' 
      : stockoutDate.toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });

    // Suggested Economic Order Quantity (EOQ): Par Level - Current Stock (bounded to minimum order pack)
    const suggestedQty = Math.max(0, Math.ceil(item.parLevel - totalCurrentUnits));
    const estimatedCost = Math.round(suggestedQty * item.averageUnitCost);

    // Urgency Classification
    let urgencyLevel: 'CRITICAL' | 'WARNING' | 'HEALTHY' | 'OVERSTOCKED' = 'HEALTHY';
    let urgencyMessage = 'Stock is within healthy par limits';

    if (totalCurrentUnits === 0 || daysRemaining <= leadTime) {
      urgencyLevel = 'CRITICAL';
      urgencyMessage = `CRITICAL: Stockout projected in ${daysRemaining.toFixed(1)} days (less than ${leadTime}-day supplier lead time!)`;
    } else if (totalCurrentUnits <= dynamicReorderPoint || totalCurrentUnits <= item.reorderPoint) {
      urgencyLevel = 'WARNING';
      urgencyMessage = `REORDER: Current stock (${totalCurrentUnits} ${item.baseUnit}) is below dynamic ROP (${dynamicReorderPoint} ${item.baseUnit})`;
    } else if (daysRemaining > 60) {
      urgencyLevel = 'OVERSTOCKED';
      urgencyMessage = `OVERSTOCKED: ${daysRemaining.toFixed(0)} days of supply; consider promotional menu placement`;
    }

    return {
      stockItemId: item.id,
      code: item.code,
      name: item.name,
      category: item.category,
      baseUnit: item.baseUnit,
      currentStockTotal: totalCurrentUnits,
      staticReorderPoint: item.reorderPoint,
      parLevel: item.parLevel,
      averageUnitCost: item.averageUnitCost,
      averageDailyConsumption: adc,
      leadTimeDays: leadTime,
      leadTimeDemand,
      safetyStock,
      dynamicReorderPoint,
      daysOfInventoryRemaining: daysRemaining,
      urgencyLevel,
      urgencyMessage,
      suggestedReorderQuantity: suggestedQty,
      stockoutProjectedDate: stockoutFormatted,
      estimatedReplenishmentCost: estimatedCost,
      historicalMovementCount: consumptionMovements.length,
      supplierName: item.category === 'SPIRITS' ? 'Diageo EABL Kenya' : 
                    item.category === 'BEER' ? 'Kenya Breweries Ltd' : 
                    item.category === 'WINE' ? 'Wine & Spirits Dist. EA' : 'Nairobi Central Beverage Wholesalers'
    };
  });
};
