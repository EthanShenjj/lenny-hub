import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconDatabase,
  IconRefresh,
} from "@tabler/icons-react";
import { PageHeader } from "@/components/page-header";
import { SyncButton } from "@/components/action-buttons";
import { getSyncRuns } from "@/lib/data";

export const dynamic = "force-dynamic";

const statusLabel = {
  running: "同步中",
  success: "成功",
  partial: "部分成功",
  failed: "失败",
};

export default async function SyncPage() {
  const runs = await getSyncRuns();
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="LOCAL DATA PIPELINE"
        title="同步记录"
        description="每天检查 Newsletter RSS、官方 Sitemap 与 Podcast RSS；公开内容入库，付费墙和无字幕内容保留明确状态。"
        action={<SyncButton />}
      />
      <section className="source-status-grid">
        <SourceStatus
          icon={<IconRefresh size={19} />}
          title="Newsletter RSS"
          url="lennysnewsletter.com/feed"
          note="标题、日期与公开预览"
        />
        <SourceStatus
          icon={<IconDatabase size={19} />}
          title="官方 Sitemap"
          url="lennysnewsletter.com/sitemap"
          note="补齐文章来源链接"
        />
        <SourceStatus
          icon={<IconRefresh size={19} />}
          title="Podcast RSS"
          url="api.substack.com/feed/podcast"
          note="节目元数据与公开摘要"
        />
      </section>

      <section className="sync-log-panel">
        <div className="section-title-row">
          <div>
            <p className="panel-kicker">RUN HISTORY</p>
            <h2>运行记录</h2>
          </div>
          <span>{runs.length} 次记录</span>
        </div>
        <div className="sync-table-wrap">
          <table className="sync-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>触发方式</th>
                <th>开始时间</th>
                <th>新增</th>
                <th>更新</th>
                <th>跳过</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <span className={`sync-status sync-${run.status}`}>
                      {run.status === "success" ? (
                        <IconCheck size={14} />
                      ) : run.status === "running" ? (
                        <IconClock size={14} />
                      ) : (
                        <IconAlertTriangle size={14} />
                      )}
                      {statusLabel[run.status]}
                    </span>
                  </td>
                  <td>
                    {run.trigger === "manual"
                      ? "手动"
                      : run.trigger === "startup"
                        ? "启动补跑"
                        : "定时"}
                  </td>
                  <td>{new Date(run.startedAt).toLocaleString("zh-CN")}</td>
                  <td>{run.addedCount}</td>
                  <td>{run.updatedCount}</td>
                  <td>{run.skippedCount}</td>
                  <td className="sync-message">
                    {run.errorMessage || "完成，已有内容保持去重。"}
                  </td>
                </tr>
              ))}
              {!runs.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-inline">
                      <IconClock size={22} />
                      <p>还没有同步记录。点击“立即同步”运行第一次检查。</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="sync-policy-note">
        <IconAlertTriangle size={18} />
        <div>
          <strong>内容边界</strong>
          <p>不会绕过付费墙或登录态。网络失败、字幕缺失和付费预览都会保留已有数据，并在下次运行时继续尝试补齐。</p>
        </div>
      </div>
    </div>
  );
}

function SourceStatus({
  icon,
  title,
  url,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  url: string;
  note: string;
}) {
  return (
    <article>
      <span className="source-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{url}</p>
        <small>{note}</small>
      </div>
      <i className="status-dot" title="已配置" />
    </article>
  );
}
