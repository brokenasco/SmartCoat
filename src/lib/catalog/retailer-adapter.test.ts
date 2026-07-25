import { describe,expect,it } from "vitest";
import { LowesCatalogAdapter } from "./lowes-catalog-adapter";
import { HomeDepotCatalogAdapter } from "./home-depot-catalog-adapter";
const record={retailer_product_id:"item-1",sku:"sku-1",manufacturer:"Example",product_line:"Interior",project_use:"interior",sheen:"eggshell",container_gallons:1,coverage_sqft_per_gallon:400,price_cents:4999,availability:"available",collected_at:"2026-07-25T00:00:00.000Z"};
describe("retailer adapters",()=>{
  it("keeps Lowe's and Home Depot identities separate",()=>{expect(new LowesCatalogAdapter().parseProducts([record]).products[0].retailer).toBe("lowes");expect(new HomeDepotCatalogAdapter().parseProducts([record]).products[0].retailer).toBe("home_depot");});
  it("blocks unauthorized sources",()=>{expect(()=>new LowesCatalogAdapter().validateSource("pending_permission")).toThrow(/not authorized/i);});
  it("quarantines malformed records",()=>{expect(new HomeDepotCatalogAdapter().parseProducts([{sku:""}]).errors).toHaveLength(1);});
});
