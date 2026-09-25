import { getPageContent } from "@/lib/cms/loaders";
import HomePageView from "@/components/pages/HomePageView";

export const revalidate = 3600;

export default async function Home() {
  const content = await getPageContent("home");
  return <HomePageView content={content} />;
}
