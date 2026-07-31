import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconArrowLeft,
  IconBook2,
  IconCalendar,
  IconExternalLink,
  IconMicrophone2,
  IconQuote,
  IconSparkles,
} from "@tabler/icons-react";
import { AnalyzeButton } from "@/components/action-buttons";
import { getContentById } from "@/lib/data";
import { formatTimestamp } from "@/lib/utils";
import { topicLabel } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = await getContentById(id);
  return { title: content?.title || "内容详情" };
}

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = await getContentById(id);
  if (!content) notFound();
  const insight = content.insight;
  const citationMap = new Map(insight?.citations.map((citation) => [citation.chunkId, citation]));

  return (
    <div className="page-container detail-page">
      <Link href="/content" className="back-link">
        <IconArrowLeft size={17} /> 返回内容库
      </Link>
      <header className="detail-header">
        <div className={`detail-type-icon ${content.type}`}>
          {content.type === "podcast" ? (
            <IconMicrophone2 size={24} />
          ) : (
            <IconBook2 size={24} />
          )}
        </div>
        <div className="detail-header-copy">
          <p className="type-label">
            {content.type === "podcast" ? "LENNY'S PODCAST" : "LENNY'S NEWSLETTER"}
          </p>
          <h1>{content.title}</h1>
          {content.description && <p>{content.description}</p>}
          <div className="detail-meta">
            {content.guest && <strong>{content.guest}</strong>}
            {content.publishedAt && (
              <span><IconCalendar size={15} /> {content.publishedAt}</span>
            )}
            <span>{content.wordCount.toLocaleString()} 词</span>
            <span className={`body-state body-state-${content.bodyStatus}`}>
              {content.bodyStatus === "available"
                ? "正文可用"
                : content.bodyStatus === "preview"
                  ? "公开预览"
                  : "正文待补充"}
            </span>
          </div>
          <div className="tag-row">
            {content.tags.map((tag) => (
              <Link href={`/content?topic=${tag}`} className="tag" key={tag}>
                {topicLabel(tag)}
              </Link>
            ))}
          </div>
        </div>
        <div className="detail-actions">
          {content.sourceUrl && (
            <a
              className="secondary-button"
              href={content.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              查看原始来源 <IconExternalLink size={16} />
            </a>
          )}
          <AnalyzeButton contentId={content.id} stale={Boolean(insight?.stale)} />
        </div>
      </header>

      {insight ? (
        <section className={`insight-layout ${insight.stale ? "insight-stale" : ""}`}>
          {insight.stale && (
            <div className="stale-banner">
              原文已更新，这份解读基于旧版本。请重新分析后再引用。
            </div>
          )}
          <div className="insight-main">
            <article className="conclusion-card">
              <span><IconSparkles size={17} /> 一句话结论</span>
              <h2>{insight.payload.oneLineConclusion}</h2>
            </article>
            <InsightSection title="为什么重要">
              <p>{insight.payload.whyItMatters}</p>
            </InsightSection>
            <InsightSection title="核心观点">
              <div className="core-points">
                {insight.payload.corePoints.map((point, index) => (
                  <article key={`${point.title}-${index}`}>
                    <span className="point-number">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{point.title}</h3>
                      <p>{point.explanation}</p>
                      <CitationLinks ids={point.citationIds} citationMap={citationMap} />
                    </div>
                  </article>
                ))}
              </div>
            </InsightSection>
            <InsightSection title="论证链">
              <ol className="argument-chain">
                {insight.payload.argumentChain.map((item, index) => (
                  <li key={`${item}-${index}`}>
                    <span>{index + 1}</span><p>{item}</p>
                  </li>
                ))}
              </ol>
            </InsightSection>
            <InsightSection title="案例与数据">
              <div className="case-list">
                {insight.payload.casesAndData.map((item, index) => (
                  <article key={`${item.statement}-${index}`}>
                    <IconQuote size={18} />
                    <div>
                      <p>{item.statement}</p>
                      <CitationLinks ids={item.citationIds} citationMap={citationMap} />
                    </div>
                  </article>
                ))}
              </div>
            </InsightSection>
            <InsightSection title="实际应用">
              <ul className="check-list">
                {insight.payload.applications.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </InsightSection>
            <InsightSection title="我的解读">
              <p>{insight.payload.myTake}</p>
            </InsightSection>
            <div className="two-column-sections">
              <InsightSection title="适用边界">
                <ul className="plain-list">
                  {insight.payload.boundaries.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </InsightSection>
              <InsightSection title="开放问题">
                <ul className="plain-list">
                  {insight.payload.openQuestions.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </InsightSection>
            </div>
          </div>
          <aside className="evidence-rail">
            <div className="evidence-heading">
              <p className="panel-kicker">SOURCE EVIDENCE</p>
              <h2>引用证据</h2>
              <span>{insight.citations.length} 个原文片段</span>
            </div>
            {insight.citations.map((citation, index) => (
              <article id={`evidence-${citation.chunkId}`} key={citation.chunkId}>
                <span className="evidence-number">{index + 1}</span>
                <p>{citation.quote}</p>
                <div>
                  <span>{citation.label}</span>
                  {citation.sourceUrl ? (
                    <a href={citation.sourceUrl} target="_blank" rel="noreferrer">
                      原文 <IconExternalLink size={13} />
                    </a>
                  ) : (
                    <a href={`#${citation.anchor}`}>定位段落</a>
                  )}
                </div>
              </article>
            ))}
            <p className="model-note">
              由 {insight.model} 生成 · {new Date(insight.createdAt).toLocaleString("zh-CN")}
            </p>
          </aside>
        </section>
      ) : (
        <section className="analysis-empty">
          <span><IconSparkles size={25} /></span>
          <h2>这篇内容还没有中文解读</h2>
          <p>
            解读会严格采用固定结构，并将每个核心结论关联到下方的原文片段。
            {content.bodyStatus === "missing" && " 当前正文缺失，需要先同步或补充内容。"}
          </p>
          <AnalyzeButton contentId={content.id} />
        </section>
      )}

      <section className="source-section">
        <div className="section-title-row">
          <div>
            <p className="panel-kicker">SOURCE CHUNKS</p>
            <h2>原文片段</h2>
          </div>
          <span>共 {content.chunks.length} 段</span>
        </div>
        <div className="source-chunks">
          {content.chunks.slice(0, 80).map((chunk) => (
            <article id={chunk.anchor} key={chunk.id}>
              <div className="chunk-meta">
                <span>{chunk.heading || chunk.speaker || `段落 ${chunk.ordinal + 1}`}</span>
                {chunk.timestampSeconds !== null && (
                  <span>{formatTimestamp(chunk.timestampSeconds)}</span>
                )}
              </div>
              <p>{chunk.quoteText}</p>
            </article>
          ))}
        </div>
        {content.chunks.length > 80 && (
          <p className="source-limit-note">
            页面显示前 80 段，完整正文仍保存在本地数据库并参与全文检索。
          </p>
        )}
      </section>
    </div>
  );
}

function InsightSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="insight-section">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function CitationLinks({
  ids,
  citationMap,
}: {
  ids: string[];
  citationMap: Map<string, { chunkId: string; label: string } | undefined>;
}) {
  return (
    <div className="citation-links">
      {ids.map((id) => {
        const citation = citationMap.get(id);
        return citation ? (
          <a href={`#evidence-${id}`} key={id}>
            <IconQuote size={13} /> {citation.label}
          </a>
        ) : null;
      })}
    </div>
  );
}
