import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  logo: string;
  theme: string;
}

interface TenantState {
  currentTenant: Tenant | null;
}

const initialState: TenantState = {
  currentTenant: null,
};

const tenantSlice = createSlice({
  name: "tenant",
  initialState,
  reducers: {
    setTenant(state, action: PayloadAction<Tenant>) {
      state.currentTenant = action.payload;
    },
  },
});

export const { setTenant } = tenantSlice.actions;
export default tenantSlice.reducer;

