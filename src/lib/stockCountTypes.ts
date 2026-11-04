export interface CountVariant { color: string; size: string; stock: number; barcode?: string; }
export interface CountProduct { id: number; code: string; name: string; unit: string; stock: number; version: number; variantBarcodes: CountVariant[]; }
export interface CountItem { productId: number; code: string; name: string; unit: string; expectedVersion: number; expectedQuantity: number; countedQuantity: number; expectedVariants: CountVariant[]; countedVariants: CountVariant[]; }
export interface StockCount { id: number; countNumber: string; items: CountItem[]; status: 'pending' | 'approved' | 'rejected'; notes: string; decisionReason?: string; createdBy: number; createdAt: string; version: number; }
export interface ReservationIssue { id: number; productId: number; productName: string; orderNumber?: string; workOrderBarcode?: string; remainingQuantity: number; reasons: string[]; }
