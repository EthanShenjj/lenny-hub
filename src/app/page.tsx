import Link from "next/link";
import {
  IconArrowRight,
  IconBook2,
  IconCalendarPlus,
  IconCategory2,
  IconMicrophone2,
  IconSearch,
  IconSparkles,
} from "@tabler/icons-react";
import { PageHeader } from "@/components/page-header";
import { TopicCoverageChart, TrendChart } from "@/components/dashboard-charts";
import { getDashboardStats } from "@/lib/data";
import { topicLabel } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const stats = await getDashboardStats();
  const progress =
    stats.totals.all === 0 ? 0 : Math.round((stats.totals.analyzed / stats.totals.all) * 100);
  const cards = [
    {
      label: "Podcast",
      value: stats.totals.podcasts,
      icon: IconMicrophone2,
      tone: "orange",
      note: "含发言人与时间戳",
    },
    {
      label: "Newsletter",
      value: stats.totals.newsletters,
      icon: IconBook2,
      tone: "dark",
      note: "文章与公开预览",
    },
    {
      label: "主题",
      value: stats.totals.topics,
      icon: IconCategory2,
      tone: "blue",
      note: "跨内容统一分类",
    },
    {
      label: "已解读",
      value: stats.totals.analyzed,
      icon: IconSparkles,
      tone: "green",
      note: `${progress}% 分析进度`,
    },
    {
      label: "本周新增",
      value: stats.totals.addedThisWeek,
      icon: IconCalendarPlus,
      tone: "purple",
      note: "同步后自动入库",
    },
  ];

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="PERSONAL KNOWLEDGE WORKSPACE"
        title="早上好，今天想研究什么？"
        description={`在 ${stats.totals.all.toLocaleString()} 篇 Lenny Podcast 与 Newsletter 中，找到可靠、可追溯的产品洞察。`}
      />

      <form action="/content" className="hero-search">
        <IconSearch size={22} />
        <input name="q" placeholder="搜索产品战略、增长、AI、某位嘉宾或一句原话…" />
        <button type="submit">
          搜索知识库 <IconArrowRight size={17} />
        </button>
      </form>

      <section className="stats-grid" aria-label="知识库统计">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="stat-card" key={card.label}>
              <span className={`stat-icon stat-icon-${card.tone}`}>
                <Icon size={20} stroke={1.8} />
              </span>
              <p>{card.label}</p>
              <strong>{card.value.toLocaleString()}</strong>
              <small>{card.note}</small>
            </article>
          );
        })}
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">PUBLISHING RHYTHM</p>
              <h2>按月发布趋势</h2>
            </div>
            <span className="panel-note">最近 18 个月</span>
          </div>
          <TrendChart data={stats.monthlyTrend} />
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">ANALYSIS</p>
              <h2>解读进度</h2>
            </div>
            <strong className="progress-value">{progress}%</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-copy">
            <strong>{stats.totals.analyzed.toLocaleString()}</strong>
            <span>/ {stats.totals.all.toLocaleString()} 篇已完成</span>
          </div>
          <div className="availability-list">
            <div>
              <span><i className="dot available" />正文可用</span>
              <strong>{stats.bodyAvailability.available}</strong>
            </div>
            <div>
              <span><i className="dot preview" />公开预览</span>
              <strong>{stats.bodyAvailability.preview}</strong>
            </div>
            <div>
              <span><i className="dot missing" />待补充</span>
              <strong>{stats.bodyAvailability.missing}</strong>
            </div>
          </div>
          <Link href="/content?insightStatus=not_started" className="panel-link">
            继续生成解读 <IconArrowRight size={16} />
          </Link>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">TOPICS</p>
              <h2>17 个主题分布</h2>
            </div>
          </div>
          <div className="topic-cloud">
            {[...stats.topicDistribution]
              .sort((a, b) => b.count - a.count)
              .map((item) => (
                <Link href={`/content?topic=${item.topic}`} key={item.topic}>
                  <span>{topicLabel(item.topic)}</span>
                  <strong>{item.count}</strong>
                </Link>
              ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">COVERAGE</p>
              <h2>同一主题的内容覆盖</h2>
            </div>
            <span className="panel-note">Top 8 主题</span>
          </div>
          <TopicCoverageChart data={stats.topicCoverage} />
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">RECENT</p>
              <h2>最近生成</h2>
            </div>
          </div>
          <div className="recent-list">
            {stats.recentInsights.map((item) => (
              <Link href={`/content/${item.contentId}`} key={`${item.contentId}-${item.createdAt}`}>
                <span className={`mini-type ${item.type}`}>
                  {item.type === "podcast" ? "P" : "N"}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {new Date(item.createdAt).toLocaleDateString("zh-CN")} · {item.model}
                  </small>
                </span>
                <IconArrowRight size={16} />
              </Link>
            ))}
            {!stats.recentInsights.length && (
              <div className="empty-inline">
                <IconSparkles size={22} />
                <p>还没有生成记录。打开一篇内容开始第一份解读。</p>
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
