import { Poppins, Righteous } from "next/font/google";

export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});
export const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });
