/**
 * Official GİB (Gelir İdaresi Başkanlığı) UBL-TR 1.2 XML Generator for DMR Nexus
 * Complies with OASIS Universal Business Language (UBL) 2.1 & GİB UBL-TR 1.2 Standards.
 * Generates valid e-Fatura (Invoice) and e-İrsaliye (DespatchAdvice) XML structures
 * ready for direct import into GİB Portal or official private integrators (Logo, Uyumsoft, Foriba, Digital Planet, etc.)
 */

import type { Invoice, InvoiceItem, Waybill, WaybillItem, Contact } from '../types';

// Helper to sanitize XML special characters
export function escapeXml(unsafe: string | number | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return '';
  const str = String(unsafe);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Generate standard UUID v4 if not provided
export function generateUuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Map Turkish units to UN/ECE Recommendation 20 Unit Codes
export function getUblUnitCode(unit: string | undefined): string {
  if (!unit) return 'C62'; // Standard pieces (Adet)
  const lower = unit.toLowerCase().trim();
  if (lower.includes('çift') || lower.includes('cift')) return 'PR'; // Pair
  if (lower.includes('adet') || lower.includes('tane')) return 'C62'; // Piece
  if (lower.includes('metre') || lower.includes('mt')) return 'MTR';
  if (lower.includes('kg') || lower.includes('kilo')) return 'KGM';
  if (lower.includes('paket') || lower.includes('pk')) return 'PA';
  if (lower.includes('koli')) return 'BX'; // Box
  if (lower.includes('dm') || lower.includes('desimetre')) return 'DMK'; // dm²
  return 'C62';
}

export interface CompanyInfo {
  companyName: string;
  companyTitle?: string;
  taxOffice: string;
  taxNumber: string;
  address?: string;
  district?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  tradeRegistryNo?: string;
  mersisNo?: string;
  iban?: string;
}

/**
 * Generates official GİB UBL-TR 1.2 e-Fatura XML
 */
export function generateUblTrInvoiceXml(
  invoice: any,
  itemsOrSupplier?: any,
  supplierOrCustomer?: any,
  customerOrUndefined?: any
): string {
  let items: InvoiceItem[] = [];
  let supplier: CompanyInfo;
  let customer: Partial<Contact> = {};

  if (Array.isArray(itemsOrSupplier)) {
    items = itemsOrSupplier;
    supplier = supplierOrCustomer || {};
    customer = customerOrUndefined || invoice.contact || {};
  } else {
    items = invoice.items || [];
    supplier = itemsOrSupplier || {};
    customer = invoice.contact || {};
  }

  const uuid = invoice.ettn || generateUuidV4();
  const invoiceDate = invoice.date instanceof Date 
    ? invoice.date.toISOString().split('T')[0] 
    : String(invoice.date).split('T')[0];
  const invoiceTime = '12:00:00';

  // Determine ProfileID
  let profileId = 'TICARIFATURA';
  if (invoice.scenario === 'basic') profileId = 'TEMELFATURA';
  else if (invoice.scenario === 'return') profileId = 'IADE';
  else if (invoice.scenario === 'export') profileId = 'IHRACAT';

  // Determine InvoiceTypeCode
  let invoiceTypeCode = 'SATIS';
  if (invoice.scenario === 'withholding' || (invoice.withholdingRate && invoice.withholdingRate > 0)) {
    invoiceTypeCode = 'TEVKIFAT';
  } else if (invoice.scenario === 'return') {
    invoiceTypeCode = 'IADE';
  } else if (invoice.scenario === 'export') {
    invoiceTypeCode = 'ISTISNA';
  }

  const currency = invoice.currency || 'TRY';

  // Customer identification
  const customerTaxNumber = (customer.taxNumber || customer.tcKimlik || '11111111111').trim();
  const isIndividual = customerTaxNumber.length === 11;
  const customerSchemeId = isIndividual ? 'TCKN' : 'VKN';
  const customerTitle = customer.companyTitle || customer.name || 'Müşteri';
  const customerTaxOffice = customer.taxOffice || 'Vergi Dairesi';
  const customerCity = customer.city || 'İstanbul';
  const customerDistrict = customer.district || 'Başakşehir';
  const customerAddress = customer.address || 'Türkiye';

  // Supplier identification
  const supplierTaxNumber = (supplier.taxNumber || '7340592811').trim();
  const supplierSchemeId = supplierTaxNumber.length === 11 ? 'TCKN' : 'VKN';
  const supplierTitle = supplier.companyTitle || supplier.companyName || 'DMR Nexus';
  const supplierTaxOffice = supplier.taxOffice || 'İkitelli V.D.';
  const supplierCity = supplier.city || 'İstanbul';
  const supplierDistrict = supplier.district || 'Başakşehir';
  const supplierAddress = supplier.address || 'Organize Sanayi Bölgesi';

  // Calculate totals and tax breakdowns
  const subtotal = invoice.subtotal || items.reduce((acc, it) => acc + (it.unitPrice * it.quantity - (it.discountAmount || 0)), 0);
  const taxTotal = invoice.taxTotal || items.reduce((acc, it) => acc + (it.taxAmount || 0), 0);
  const discountTotal = invoice.discountTotal || items.reduce((acc, it) => acc + (it.discountAmount || 0), 0);
  
  // Tevkifat calculation
  const withholdingRate = invoice.withholdingRate || 0;
  const withholdingAmount = invoice.withholdingAmount || (withholdingRate > 0 ? (taxTotal * (withholdingRate / 10)) : 0);
  const payableAmount = invoice.grandTotal || (subtotal + taxTotal - withholdingAmount);

  // Group taxes by rate (0, 1, 10, 20)
  const taxSubtotalsMap = new Map<number, { taxableAmount: number; taxAmount: number }>();
  items.forEach((item) => {
    const rate = Number(item.taxRate) || 0;
    const lineMatrah = (item.unitPrice * item.quantity) - (item.discountAmount || 0);
    const lineTax = item.taxAmount || (lineMatrah * (rate / 100));

    const existing = taxSubtotalsMap.get(rate) || { taxableAmount: 0, taxAmount: 0 };
    existing.taxableAmount += lineMatrah;
    existing.taxAmount += lineTax;
    taxSubtotalsMap.set(rate, existing);
  });

  // Build TaxSubtotal XML blocks
  const taxSubtotalsXml = Array.from(taxSubtotalsMap.entries()).map(([rate, val]) => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${val.taxableAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${val.taxAmount.toFixed(2)}</cbc:TaxAmount>
      <cbc:Percent>${rate}</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join('');

  // Build Tevkifat WithholdingTaxTotal XML if applicable
  let withholdingXml = '';
  if (withholdingAmount > 0 && withholdingRate > 0) {
    withholdingXml = `
  <cac:WithholdingTaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${withholdingAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${taxTotal.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${withholdingAmount.toFixed(2)}</cbc:TaxAmount>
      <cbc:Percent>${withholdingRate * 10}</cbc:Percent>
      <cac:TaxCategory>
        <cbc:TaxExemptionReasonCode>601</cbc:TaxExemptionReasonCode>
        <cbc:TaxExemptionReason>KDV Tevkifatı (${withholdingRate}/10 Oranında)</cbc:TaxExemptionReason>
        <cac:TaxScheme>
          <cbc:Name>Tevkifat</cbc:Name>
          <cbc:TaxTypeCode>9015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:WithholdingTaxTotal>`;
  }

  // Build InvoiceLine XML blocks
  const linesXml = items.map((item, idx) => {
    const lineId = idx + 1;
    const unitCode = getUblUnitCode(item.unit);
    const lineMatrah = (item.unitPrice * item.quantity) - (item.discountAmount || 0);
    const lineTax = item.taxAmount || (lineMatrah * ((item.taxRate || 0) / 100));

    return `
  <cac:InvoiceLine>
    <cbc:ID>${lineId}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${unitCode}">${item.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${lineMatrah.toFixed(2)}</cbc:LineExtensionAmount>
    ${item.discountAmount && item.discountAmount > 0 ? `
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:Amount currencyID="${currency}">${item.discountAmount.toFixed(2)}</cbc:Amount>
    </cac:AllowanceCharge>` : ''}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${lineTax.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${lineMatrah.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${lineTax.toFixed(2)}</cbc:TaxAmount>
        <cbc:Percent>${item.taxRate || 0}</cbc:Percent>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${escapeXml(item.productName)} ${item.color ? `(${escapeXml(item.color)})` : ''} ${item.size ? `Beden: ${escapeXml(item.size)}` : ''}</cbc:Description>
      <cbc:Name>${escapeXml(item.productName)}</cbc:Name>
      <cac:SellersItemIdentification>
        <cbc:ID>${escapeXml(item.productCode || 'PRD-' + lineId)}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${item.unitPrice.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ccts="urn:un:unece:uncefact:documentation:2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:ubltr="urn:oasis:names:specification:ubl:schema:xsd:TurkishCustomizationExtensionComponents">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${profileId}</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.invoiceNumber || 'GIB' + invoiceDate.replace(/-/g, '') + '0001')}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${invoiceDate}</cbc:IssueDate>
  <cbc:IssueTime>${invoiceTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:Note>DMR Nexus e-Fatura Sistemi ile UBL-TR 1.2 Formatında Üretilmiştir.</cbc:Note>
  ${invoice.notes ? `<cbc:Note>${escapeXml(invoice.notes)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${items.length}</cbc:LineCountNumeric>

  ${invoice.orderNumber ? `
  <cac:OrderReference>
    <cbc:ID>${escapeXml(invoice.orderNumber)}</cbc:ID>
    <cbc:IssueDate>${invoiceDate}</cbc:IssueDate>
  </cac:OrderReference>` : ''}

  ${invoice.waybillNumber ? `
  <cac:DespatchDocumentReference>
    <cbc:ID>${escapeXml(invoice.waybillNumber)}</cbc:ID>
    <cbc:IssueDate>${invoiceDate}</cbc:IssueDate>
  </cac:DespatchDocumentReference>` : ''}

  <!-- GÖNDERİCİ (SUPPLIER) BİLGİLERİ -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      ${supplier.website ? `<cbc:WebsiteURI>${escapeXml(supplier.website)}</cbc:WebsiteURI>` : ''}
      <cac:PartyIdentification>
        <cbc:ID schemeID="${supplierSchemeId}">${supplierTaxNumber}</cbc:ID>
      </cac:PartyIdentification>
      ${supplier.tradeRegistryNo ? `
      <cac:PartyIdentification>
        <cbc:ID schemeID="TICARETSICILNO">${escapeXml(supplier.tradeRegistryNo)}</cbc:ID>
      </cac:PartyIdentification>` : ''}
      <cac:PartyName>
        <cbc:Name>${escapeXml(supplierTitle)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(supplierAddress)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escapeXml(supplierDistrict)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(supplierCity)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(supplier.postalCode || '34490')}</cbc:PostalZone>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXml(supplierTaxOffice)}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:Telephone>${escapeXml(supplier.phone || '')}</cbc:Telephone>
        <cbc:ElectronicMail>${escapeXml(supplier.email || '')}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- ALICI (CUSTOMER) BİLGİLERİ -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${customerSchemeId}">${customerTaxNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(customerTitle)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(customerAddress)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escapeXml(customerDistrict)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(customerCity)}</cbc:CityName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXml(customerTaxOffice)}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:Telephone>${escapeXml(customer.phone || '')}</cbc:Telephone>
        <cbc:ElectronicMail>${escapeXml(customer.email || '')}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- ÖDEME VE VADE KOŞULLARI -->
  ${invoice.dueDate ? `
  <cac:PaymentTerms>
    <cbc:Note>Vade Tarihi: ${invoice.dueDate instanceof Date ? invoice.dueDate.toISOString().split('T')[0] : String(invoice.dueDate).split('T')[0]}</cbc:Note>
    <cbc:PaymentDueDate>${invoice.dueDate instanceof Date ? invoice.dueDate.toISOString().split('T')[0] : String(invoice.dueDate).split('T')[0]}</cbc:PaymentDueDate>
  </cac:PaymentTerms>` : ''}

  <!-- VERGİ DÖKÜMÜ (TAX TOTAL) -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${taxTotal.toFixed(2)}</cbc:TaxAmount>
    ${taxSubtotalsXml}
  </cac:TaxTotal>

  ${withholdingXml}

  <!-- PARASAL TOPLAMLAR (LEGAL MONETARY TOTAL) -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${(subtotal + taxTotal).toFixed(2)}</cbc:TaxInclusiveAmount>
    ${discountTotal > 0 ? `<cbc:AllowanceTotalAmount currencyID="${currency}">${discountTotal.toFixed(2)}</cbc:AllowanceTotalAmount>` : ''}
    <cbc:PayableAmount currencyID="${currency}">${payableAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- FATURA KALEMLERİ (INVOICE LINES) -->
  ${linesXml}
</Invoice>`;
}

/**
 * Generates official GİB UBL-TR 1.2 e-İrsaliye (DespatchAdvice) XML
 */
export function generateUblTrWaybillXml(
  waybill: any,
  itemsOrSupplier?: any,
  supplierOrCustomer?: any,
  customerOrUndefined?: any
): string {
  let items: WaybillItem[] = [];
  let supplier: CompanyInfo;
  let customer: Partial<Contact> = {};

  if (Array.isArray(itemsOrSupplier)) {
    items = itemsOrSupplier;
    supplier = supplierOrCustomer || {};
    customer = customerOrUndefined || waybill.contact || {};
  } else {
    items = waybill.items || [];
    supplier = itemsOrSupplier || {};
    customer = waybill.contact || {};
  }

  const uuid = waybill.ettn || generateUuidV4();
  const issueDate = waybill.date instanceof Date 
    ? waybill.date.toISOString().split('T')[0] 
    : String(waybill.date).split('T')[0];
  const dispatchDate = waybill.dispatchDate 
    ? (waybill.dispatchDate instanceof Date ? waybill.dispatchDate.toISOString().split('T')[0] : String(waybill.dispatchDate).split('T')[0])
    : issueDate;
  const dispatchTime = waybill.dispatchTime || '10:00:00';

  const supplierTaxNumber = (supplier.taxNumber || '7340592811').trim();
  const supplierSchemeId = supplierTaxNumber.length === 11 ? 'TCKN' : 'VKN';
  const customerTaxNumber = (customer.taxNumber || customer.tcKimlik || '11111111111').trim();
  const customerSchemeId = customerTaxNumber.length === 11 ? 'TCKN' : 'VKN';

  const linesXml = items.map((item, idx) => {
    const lineId = idx + 1;
    const unitCode = getUblUnitCode(item.unit);
    return `
  <cac:DespatchLine>
    <cbc:ID>${lineId}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="${unitCode}">${item.quantity}</cbc:DeliveredQuantity>
    <cac:OrderLineReference>
      <cbc:LineID>${lineId}</cbc:LineID>
    </cac:OrderLineReference>
    <cac:Item>
      <cbc:Description>${escapeXml(item.productName)} ${item.color ? `(${escapeXml(item.color)})` : ''} ${item.size ? `Beden: ${escapeXml(item.size)}` : ''}</cbc:Description>
      <cbc:Name>${escapeXml(item.productName)}</cbc:Name>
      <cac:SellersItemIdentification>
        <cbc:ID>${escapeXml(item.productCode || 'PRD-' + lineId)}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
  </cac:DespatchLine>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TEMELIRSALIYE</cbc:ProfileID>
  <cbc:ID>${escapeXml(waybill.waybillNumber || 'IRS' + issueDate.replace(/-/g, '') + '0001')}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${dispatchTime}</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode>SEVK</cbc:DespatchAdviceTypeCode>
  <cbc:Note>DMR Nexus e-İrsaliye Sistemi ile UBL-TR 1.2 standardında düzenlenmiştir.</cbc:Note>
  ${waybill.notes ? `<cbc:Note>${escapeXml(waybill.notes)}</cbc:Note>` : ''}
  <cbc:LineCountNumeric>${items.length}</cbc:LineCountNumeric>

  ${waybill.orderNumber ? `
  <cac:OrderReference>
    <cbc:ID>${escapeXml(waybill.orderNumber)}</cbc:ID>
    <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  </cac:OrderReference>` : ''}

  <!-- SEVKIYAT YAPAN (DESPATCH SUPPLIER) -->
  <cac:DespatchSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${supplierSchemeId}">${supplierTaxNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(supplier.companyTitle || supplier.companyName)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(supplier.address || 'Organize Sanayi')}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escapeXml(supplier.district || 'Başakşehir')}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(supplier.city || 'İstanbul')}</cbc:CityName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:DespatchSupplierParty>

  <!-- TESLİM ALAN (DELIVERY CUSTOMER) -->
  <cac:DeliveryCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${customerSchemeId}">${customerTaxNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(customer.companyTitle || customer.name || 'Alıcı Firma')}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(customer.address || '')}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escapeXml(customer.district || '')}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(customer.city || 'İstanbul')}</cbc:CityName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:DeliveryCustomerParty>

  <!-- SEVKİYAT VE TAŞIYICI DETAYLARI -->
  <cac:Shipment>
    <cbc:ID>1</cbc:ID>
    <cbc:TotalQuantity unitCode="PR">${waybill.totalQuantity || items.reduce((a, b) => a + b.quantity, 0)}</cbc:TotalQuantity>
    <cac:Delivery>
      <cac:Despatch>
        <cbc:ActualDespatchDate>${dispatchDate}</cbc:ActualDespatchDate>
        <cbc:ActualDespatchTime>${dispatchTime}</cbc:ActualDespatchTime>
      </cac:Despatch>
      <cac:DeliveryAddress>
        <cbc:StreetName>${escapeXml(waybill.deliveryAddress || customer.address || '')}</cbc:StreetName>
        <cac:Country>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:DeliveryAddress>
      ${waybill.carrierTitle ? `
      <cac:CarrierParty>
        <cac:PartyName>
          <cbc:Name>${escapeXml(waybill.carrierTitle)}</cbc:Name>
        </cac:PartyName>
      </cac:CarrierParty>` : ''}
    </cac:Delivery>
    ${waybill.vehiclePlate || waybill.driverName ? `
    <cac:TransportHandlingUnit>
      <cac:TransportMeans>
        ${waybill.vehiclePlate ? `<cbc:RegistrationNationalityID>${escapeXml(waybill.vehiclePlate)}</cbc:RegistrationNationalityID>` : ''}
        ${waybill.driverName ? `
        <cac:DriverPerson>
          <cbc:FirstName>${escapeXml(waybill.driverName)}</cbc:FirstName>
          ${waybill.driverTckn ? `<cbc:FamilyName>TCKN: ${escapeXml(waybill.driverTckn)}</cbc:FamilyName>` : ''}
        </cac:DriverPerson>` : ''}
      </cac:TransportMeans>
    </cac:TransportHandlingUnit>` : ''}
  </cac:Shipment>

  <!-- İRSALİYE KALEMLERİ -->
  ${linesXml}
</DespatchAdvice>`;
}

/**
 * Downloads generated XML content as a .xml file in browser
 */
export function downloadXmlFile(xmlContent: string, filename: string) {
  const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xml') ? filename : `${filename}.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Alias for Waybill / DespatchAdvice
export const generateUblTrDespatchXml = generateUblTrWaybillXml;
