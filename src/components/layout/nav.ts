import type { Component } from 'vue'
import type { LocationQuery, RouteRecordNameGeneric } from 'vue-router'

// The sidebar's model, shared by DefaultLayout and PlatformLayout.
//
// A section is a captioned group of entries (OPERATIONS, MANAGE…). An entry is
// either a page of its own or a menu whose sub-menu lists pages.

export interface NavLink {
  key: string
  label: string
  // The route's name.
  route: string
  // Other routes that count as this page (e.g. a new invoice counts as Invoices).
  also?: string[]
}

export interface NavItem {
  key: string
  label: string
  icon: Component
  // A page of its own…
  route?: string
  also?: string[]
  // …or a menu of pages.
  children?: NavLink[]
}

export interface NavSection {
  key: string
  caption?: string
  items: NavItem[]
}

// The parts of the current route the sidebar looks at.
export interface RouteLike {
  name?: RouteRecordNameGeneric | null
  query?: LocationQuery
}

export function isLinkActive(route: RouteLike, link: Pick<NavLink, 'route' | 'also'>): boolean {
  const name = String(route.name ?? '')
  return name === link.route || !!link.also?.includes(name)
}

// A page entry when it's showing; a menu when one of its pages is.
export function isItemActive(route: RouteLike, item: NavItem): boolean {
  if (item.children?.length) return item.children.some((c) => isLinkActive(route, c))
  return !!item.route && isLinkActive(route, { route: item.route, also: item.also })
}

// Where the current page sits in the sidebar, for the top bar's breadcrumb:
// the entry, and the sub-menu link when it's inside a menu.
export function findTrail(route: RouteLike, sections: NavSection[]): { item: NavItem; link?: NavLink } | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (!isItemActive(route, item)) continue
      return { item, link: item.children?.find((c) => isLinkActive(route, c)) }
    }
  }
  return null
}

// Only the pages `canOpen` lets in: a sub-menu page it refuses is left out, a
// menu left with no pages goes, and so does a section left empty. An entry
// with no route of its own is kept.
export function onlyOpenable(sections: NavSection[], canOpen: (route: string) => boolean): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.flatMap((item) => {
        if (item.children) {
          const children = item.children.filter((c) => canOpen(c.route))
          return children.length ? [{ ...item, children }] : []
        }
        return !item.route || canOpen(item.route) ? [item] : []
      }),
    }))
    .filter((section) => section.items.length > 0)
}
