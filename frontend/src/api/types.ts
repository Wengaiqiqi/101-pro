export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface LoginPayload {
  username_or_email: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface QuestionBank {
  id: number;
  owner_id: number;
  name: string;
  description: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

export interface QuestionBankCreate {
  name: string;
  description?: string;
}
