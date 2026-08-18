export interface User {
  // id: string;
  name: string;
  email: string;
  role: string;
  tenantId?: string | null;
  _id: string;
}

export interface LoginRequest {
  tenantId: string | null;
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  access_token: string;
  token_type: string;
  user?: User;
}

export interface RegisterRequest {
  tenantId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}
