export interface Address {
    _id: string;
    tenantId: string;
    userId: string;
  
    fullName: string;
    phone: string;
  
    addressLine1: string;
    addressLine2?: string;
  
    city: string;
    state: string;
    country: string;
    postalCode: string;
  
    addressType: "Home" | "Office" | "Other";
    isDefault: boolean;
  
    createdAt: string;
    updatedAt: string;
  }
  
  export interface CreateAddressRequest {
    tenantId: string;
    userId: string;
  
    fullName: string;
    phone: string;
  
    addressLine1: string;
    addressLine2?: string;
  
    city: string;
    state: string;
    country: string;
    postalCode: string;
  
    addressType: "Home" | "Office" | "Other";
    isDefault: boolean;
  }
  
  export interface UpdateAddressRequest
    extends Partial<Omit<CreateAddressRequest, "userId">> {
    tenantId: string;
  }
  export interface AddressFormData {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    addressType: "Home" | "Office" | "Other";
    isDefault: boolean;
  }