export type ExtensionRole = "owner" | "sales" | "customer_service";

export type LeftoverStoredExtensionRole = "employee";

export type ExtensionUser = {
  id: string;
  email: string;
  roles: ExtensionRole[];
};

export type AuthSession = {
  user: ExtensionUser;
  accessToken: string;
  refreshToken: string;
};
