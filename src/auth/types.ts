export type ExtensionRole = "owner" | "employee";

export type ExtensionUser = {
  id: string;
  email: string;
  role: ExtensionRole;
};

export type AuthSession = {
  user: ExtensionUser;
  accessToken: string;
  refreshToken: string;
};
