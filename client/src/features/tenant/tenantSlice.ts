import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { Tenant } from "../../types/tenant";

interface TenantState {
  tenantSlug: string;
  currentTenant: Tenant | null;
}

const initialState: TenantState = {
  tenantSlug: "",
  currentTenant: null,
};

const tenantSlice = createSlice({
  name: "tenant",
  initialState,
  reducers: {
    setTenantSlug(state, action: PayloadAction<string>) {
      state.tenantSlug = action.payload;
    },

    setTenant(state, action: PayloadAction<Tenant>) {
      state.currentTenant = action.payload;
    },

    clearTenant(state) {
      state.tenantSlug = "";
      state.currentTenant = null;
    },
  },
});

export const {
  setTenantSlug,
  setTenant,
  clearTenant,
} = tenantSlice.actions;

export default tenantSlice.reducer;