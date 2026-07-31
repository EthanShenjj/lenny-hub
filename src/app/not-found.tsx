import Link from "next/link";
import { IconArrowLeft, IconFileUnknown } from "@tabler/icons-react";

export default function NotFound() {
  return (
    <div className="page-container">
      <div className="empty-state error-page">
        <IconFileUnknown size={34} />
        <h1>没有找到这条内容</h1>
        <p>它可能尚未导入，或已经在同步时被合并到另一条记录。</p>
        <Link className="primary-button" href="/content">
          <IconArrowLeft size={16} /> 返回内容库
        </Link>
      </div>
    </div>
  );
}
