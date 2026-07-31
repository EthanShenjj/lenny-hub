"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  IconRefresh,
  IconSparkles,
  IconWand,
} from "@tabler/icons-react";

function useRequest() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const run = async (url: string, successMessage: string) => {
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(url, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "操作失败");
      setMessage(successMessage);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };
  return { loading, message, error, run };
}

export function AnalyzeButton({ contentId, stale = false }: { contentId: string; stale?: boolean }) {
  const request = useRequest();
  return (
    <div className="action-with-status">
      <button
        className="primary-button"
        type="button"
        disabled={request.loading}
        onClick={() =>
          void request.run(`/api/content/${contentId}/analyze`, "中文解读已生成")
        }
      >
        {stale ? <IconRefresh size={17} /> : <IconWand size={17} />}
        {request.loading ? "正在生成…" : stale ? "重新分析" : "生成中文解读"}
      </button>
      {request.message && <span className="success-text">{request.message}</span>}
      {request.error && <span className="inline-error">{request.error}</span>}
    </div>
  );
}

export function SyncButton() {
  const request = useRequest();
  return (
    <div className="action-with-status">
      <button
        className="primary-button"
        type="button"
        disabled={request.loading}
        onClick={() => void request.run("/api/sync", "同步完成")}
      >
        <IconRefresh size={17} className={request.loading ? "spin" : ""} />
        {request.loading ? "正在同步…" : "立即同步"}
      </button>
      {request.message && <span className="success-text">{request.message}</span>}
      {request.error && <span className="inline-error">{request.error}</span>}
    </div>
  );
}

export function WeeklyGenerateButton() {
  const request = useRequest();
  return (
    <div className="action-with-status">
      <button
        className="primary-button"
        type="button"
        disabled={request.loading}
        onClick={() =>
          void request.run("/api/weekly/generate", "本周洞察已生成")
        }
      >
        <IconSparkles size={17} />
        {request.loading ? "正在梳理…" : "生成本周洞察"}
      </button>
      {request.message && <span className="success-text">{request.message}</span>}
      {request.error && <span className="inline-error">{request.error}</span>}
    </div>
  );
}
