import { useEffect, useState } from 'react';
import { GitHostIcon } from '../icons';
import type { GitRemoteInfo } from '../../types/project';

interface ProjectIconProps {
  remote: GitRemoteInfo | null | undefined;
  size?: number;
}

// Superellipse (iOS-style squircle) outline normalized to a 100×100 box, used
// as a CSS mask so avatars get continuous rounded corners instead of a circle.
const SQUIRCLE_PATH =
  'M50 0C12.5 0 0 12.5 0 50C0 87.5 12.5 100 50 100C87.5 100 100 87.5 100 50C100 12.5 87.5 0 50 0Z';
const SQUIRCLE_MASK =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='${SQUIRCLE_PATH}'/%3E%3C/svg%3E")`;

/** Build the owner avatar URL for hosts that expose one by owner handle.
 *  GitHub serves `https://github.com/<owner>.png` for both orgs and users. */
function avatarUrl(remote: GitRemoteInfo, size: number): string | null {
  if (remote.host === 'github' && remote.owner) {
    return `https://github.com/${encodeURIComponent(remote.owner)}.png?size=${size * 2}`;
  }
  return null;
}

/** Project tree icon: the repo owner's org/user avatar when we can resolve one,
 *  falling back to the git host mark (and then a generic repo icon). */
export function ProjectIcon({ remote, size = 15 }: ProjectIconProps) {
  const url = remote ? avatarUrl(remote, size) : null;
  const [failed, setFailed] = useState(false);

  // A new url (project re-keyed to a different owner) gets a fresh chance to load.
  useEffect(() => setFailed(false), [url]);

  if (!url || failed) return <GitHostIcon host={remote?.host} size={size} />;

  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="object-cover"
      style={{
        width: size,
        height: size,
        maskImage: SQUIRCLE_MASK,
        WebkitMaskImage: SQUIRCLE_MASK,
        maskSize: '100% 100%',
        WebkitMaskSize: '100% 100%',
      }}
    />
  );
}
