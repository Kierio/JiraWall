import { useState } from 'react';
import { initials } from './format';

export function Avatar({ name, url, className }: { name: string; url?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`avatar ${className ?? ''}`} title={name}>
      {url && !failed ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initials(name)}
    </div>
  );
}
