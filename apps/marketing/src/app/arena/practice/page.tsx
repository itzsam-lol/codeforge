import type { Metadata } from "next";
import ArenaPracticeListClient from "./page.client";

export const metadata: Metadata = {
  title: "Practice — CodeForge Arena",
  description: "Solve coding problems any time, at your own pace — practice doesn't affect your rating.",
};

export default function ArenaPracticeListPage() {
  return <ArenaPracticeListClient />;
}
