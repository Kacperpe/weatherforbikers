import type { Metadata } from "next";
import { PrivacyContent } from "@/components/privacy-content";

export const metadata: Metadata = {
  title: "Privacy policy | Route weather map",
  description: "Information about data processing in the Route weather map application.",
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
