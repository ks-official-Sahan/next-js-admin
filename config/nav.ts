const routes = {
  HOME: { path: "/", title: "Home" },
  UPDATES: { title: "Updates", path: "/updates" },
  CONTACT: { title: "Contact", path: "/contact" },
};

const navbarItems = [routes.HOME, routes.UPDATES];

const sidebarItems = [...navbarItems, routes.CONTACT];

export const SiteNavigations = {
  navbar: navbarItems,
  sidebar: sidebarItems,
};
