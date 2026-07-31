import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface TenantState {
  tenantId: string;
}

const initialState: TenantState = {
  tenantId: "TENANT001",
};

const tenantSlice = createSlice({
  name: "tenant",
  initialState,
  reducers: {
    setTenant(state, action: PayloadAction<string>) {
      state.tenantId = action.payload;
    },
  },
});

export const { setTenant } = tenantSlice.actions;
export default tenantSlice.reducer;