import { z } from "zod";

export const authorizedRetailerRow = z.object({
  retailer_product_id: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(160),
  manufacturer: z.string().trim().min(1).max(160),
  product_line: z.string().trim().min(1).max(160),
  project_use: z.enum(["interior","exterior","interior_exterior"]),
  sheen: z.string().trim().min(1).max(80),
  container_gallons: z.coerce.number().positive().max(20),
  coverage_sqft_per_gallon: z.coerce.number().positive().max(2000),
  price_cents: z.coerce.number().int().nonnegative(),
  sale_price_cents: z.coerce.number().int().nonnegative().optional(),
  availability: z.enum(["available","not_carried","price_unavailable","discontinued"]),
  product_url: z.url().optional(),
  collected_at: z.iso.datetime(),
});
export type AuthorizedRetailerRow = z.infer<typeof authorizedRetailerRow>;
export type NormalizedRetailerProduct = AuthorizedRetailerRow & { retailer: "lowes"|"home_depot"; parserVersion: string };

export interface RetailerCatalogAdapter {
  readonly retailer: "lowes"|"home_depot";
  readonly parserVersion: string;
  validateSource(authorizationStatus:string): void;
  parseProducts(records:unknown[]): {products:NormalizedRetailerProduct[];errors:string[]};
}

export abstract class BaseRetailerCatalogAdapter implements RetailerCatalogAdapter {
  abstract readonly retailer: "lowes"|"home_depot";
  readonly parserVersion="1.0.0";
  validateSource(status:string){if(status!=="authorized")throw new Error(`${this.retailer} source is not authorized for import.`);}
  parseProducts(records:unknown[]){
    const products:NormalizedRetailerProduct[]=[];const errors:string[]=[];
    records.forEach((record,index)=>{const parsed=authorizedRetailerRow.safeParse(record);if(parsed.success)products.push({...parsed.data,retailer:this.retailer,parserVersion:this.parserVersion});else errors.push(`row ${index+1}: ${parsed.error.issues.map(issue=>issue.message).join("; ")}`);});
    return {products,errors};
  }
}
