import { ContentBrowser } from "@/components/content-browser";
import { PageHeader } from "@/components/page-header";
import { getContent } from "@/lib/data";
import type { ContentQuery } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) => {
    const item = params[key];
    return Array.isArray(item) ? item[0] : item;
  };
  const query: ContentQuery = {
    q: value("q"),
    topic: value("topic"),
    insightStatus: value("insightStatus") as ContentQuery["insightStatus"],
  };
  const data = await getContent(query);
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="LIBRARY"
        title="内容库"
        description="全文检索与语义关联并用，通过类型、主题、年份、嘉宾和处理状态缩小范围。"
      />
      <ContentBrowser
        initialData={data}
        initialFilters={{
          q: query.q || "",
          topic: query.topic || "",
          insightStatus: query.insightStatus || "all",
        }}
      />
    </div>
  );
}
