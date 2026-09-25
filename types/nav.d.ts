type NavItemProps = {
  currentPath: string;
  title: string;
  path?: string;
  isSideBarItem?: boolean;
};

type NavBarProps = {
  title: string;
  currentPath: string;
  opened: boolean;
  toggle: () => void;
};

type SideBarProps = {
  currentPath: string;
  title: string;
  opened: boolean;
  close: () => void;
};
