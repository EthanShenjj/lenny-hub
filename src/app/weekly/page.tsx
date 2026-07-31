import Link from "next/link";
import {
  IconArrowRight,
  IconBulb,
  IconEye,
  IconGitMerge,
  IconSparkles,
} from "@tabler/icons-react";
import { PageHeader } from "@/components/page-header";
import { WeeklyGenerateButton } from "@/components/action-buttons";
import { getWeeklyDigests } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  const digests = await getWeeklyDigests();
  const latest = digests[0];
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="WEEKLY SYNTHESIS"
        title="每周洞察"
        description="把一周新增内容放在一起比较：共同主题、观点关联与冲突，以及值得实践和继续观察的问题。"
        action={<WeeklyGenerateButton />}
      />
      {latest ? (
        <div className="weekly-layout">
          <section className="weekly-main">
            <article className="weekly-hero">
              <div>
                <span><IconSparkles size={16} /> WEEKLY DIGEST</span>
                <h2>{latest.weekStart} — {latest.weekEnd}</h2>
              </div>
              <p>{latest.payload.summary}</p>
              <small>
                {new Date(latest.createdAt).toLocaleString("zh-CN")} · {latest.model}
              </small>
            </article>
            <WeeklySection icon={<IconBulb size={19} />} title="共同主题">
              <div className="weekly-card-grid">
                {latest.payload.commonThemes.map((theme) => (
                  <article key={theme.theme}>
                    <h3>{theme.theme}</h3>
                    <p>{theme.explanation}</p>
                    <ContentIdLinks ids={theme.contentIds} />
                  </article>
                ))}
              </div>
            </WeeklySection>
            <WeeklySection icon={<IconGitMerge size={19} />} title="观点关联与冲突">
              <div className="connection-list">
                {latest.payload.connections.map((connection) => (
                  <article key={connection.title}>
                    <span className={`connection-type ${connection.type}`}>
                      {connection.type === "agreement"
                        ? "共识"
                        : connection.type === "tension"
                          ? "张力"
                          : "延伸"}
                    </span>
                    <h3>{connection.title}</h3>
                    <p>{connection.explanation}</p>
                    <ContentIdLinks ids={connection.contentIds} />
                  </article>
                ))}
              </div>
            </WeeklySection>
          </section>
          <aside className="weekly-side">
            <article className="weekly-list-card">
              <span><IconBulb size={18} /> 值得实践</span>
              <ol>
                {latest.payload.practices.map((item) => <li key={item}>{item}</li>)}
              </ol>
            </article>
            <article className="weekly-list-card">
              <span><IconEye size={18} /> 继续观察</span>
              <ul>
                {latest.payload.watchList.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            {digests.length > 1 && (
              <article className="archive-card">
                <h3>历史周报</h3>
                {digests.slice(1).map((digest) => (
                  <div key={digest.id}>
                    <span>{digest.weekStart}</span>
                    <small>{digest.model}</small>
                  </div>
                ))}
              </article>
            )}
          </aside>
        </div>
      ) : (
        <div className="empty-state weekly-empty">
          <IconSparkles size={30} />
          <h2>还没有每周洞察</h2>
          <p>配置 OpenAI 密钥后，基于本周新增内容生成第一份结构化周报。</p>
          <WeeklyGenerateButton />
        </div>
      )}
    </div>
  );
}

function WeeklySection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="weekly-section">
      <h2>{icon}{title}</h2>
      {children}
    </section>
  );
}

function ContentIdLinks({ ids }: { ids: string[] }) {
  return (
    <div className="content-id-links">
      {ids.map((id) => (
        <Link href={`/content/${id}`} key={id}>
          查看来源 <IconArrowRight size={13} />
        </Link>
      ))}
    </div>
  );
}
