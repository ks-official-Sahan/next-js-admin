import { getPageContent } from "@/lib/cms/loaders";
import HomePageView from "@/components/pages/HomePageView";

export default async function Home() {
  const content = await getPageContent("home");
  return <HomePageView content={content} />;
}
