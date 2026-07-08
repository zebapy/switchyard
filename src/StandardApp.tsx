import { RouterProvider } from 'react-router';
import { router } from './router';

/**
 * The standard Switchyard interface — top bar, sidebar, git panel, the routed
 * workspace/dashboard/settings surfaces. Kept in its own module so `main.tsx`
 * can lazy-load it (or the Zen layout) and never pull both graphs at once.
 */
export function StandardApp() {
  return <RouterProvider router={router} />;
}
