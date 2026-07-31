"use client";

import { IconAlertTriangle } from "@tabler/icons-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-container">
      <div className="empty-state error-page">
        <IconAlertTriangle size={32} />
        <h1>页面加载失败</h1>
        <p>{error.message}</p>
        <button className="primary-button" type="button" onClick={reset}>
          再试一次
        </button>
      </div>
    </div>
  );
}
