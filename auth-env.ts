import dotenv from "dotenv";
import path from "path";

export interface PortalAuthConfig {
  devUserName: string;
  devUserEmail: string;
  devUserPassword: string;
  devUserFullName: string;
  izaVaUsername: string;
  izaVaEmail: string;
  izaVaName: string;
  izaVaPassword: string;
}

export function loadPortalEnvironment(): PortalAuthConfig {
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });

  return {
    devUserName: process.env.DEV_USER_NAME || "admin",
    devUserEmail: process.env.DEV_USER_EMAIL || "admin@example.com",
    devUserPassword: process.env.DEV_USER_PASSWORD || "admin123",
    devUserFullName: process.env.DEV_USER_FULLNAME || "Admin User",
    izaVaUsername: process.env.IZA_VA_USERNAME || "va_member",
    izaVaEmail: process.env.IZA_VA_EMAIL || "va_member@example.com",
    izaVaName: process.env.IZA_VA_NAME || "VA Member",
    izaVaPassword: process.env.IZA_VA_PASSWORD || "izava123",
  };
}
