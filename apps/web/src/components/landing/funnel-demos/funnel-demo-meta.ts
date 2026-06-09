import type { LucideIcon } from 'lucide-react';
import {
  PlusSquare,
  MessageCircle,
  BarChart3,
  Users,
  Lightbulb,
  Megaphone,
  Users2,
  FileText,
} from 'lucide-react';

export type FunnelDemoMeta = {
  title: string;
  Icon: LucideIcon;
};

/** Side-demo card headers (index matches FUNNEL_DEMO_SCENE_COMPONENTS). */
export const FUNNEL_DEMO_META: FunnelDemoMeta[] = [
  { title: 'Create drafts, post / schedule', Icon: PlusSquare },
  { title: 'Reply / bulk reply to comments & DMs', Icon: MessageCircle },
  { title: 'Post analytics', Icon: BarChart3 },
  { title: 'Extract leads', Icon: Users },
  { title: 'Brainstorm ideas', Icon: Lightbulb },
  { title: 'Compare ads', Icon: Megaphone },
  { title: 'Add team members', Icon: Users2 },
  { title: 'Analytic reports', Icon: FileText },
];

/** @deprecated use FUNNEL_DEMO_META */
export const FUNNEL_DEMO_TITLES = FUNNEL_DEMO_META.map((m) => m.title) as readonly string[];
