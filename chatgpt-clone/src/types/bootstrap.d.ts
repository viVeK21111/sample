declare module 'bootstrap/dist/js/bootstrap.bundle.min.js' {
  interface Bootstrap {
    Alert: {
      getInstance(element: Element): { close(): void } | null;
    };
    Button: {
      getInstance(element: Element): { toggle(): void } | null;
    };
    Carousel: {
      getInstance(element: Element): { cycle(): void } | null;
    };
    Collapse: {
      getInstance(element: Element): { toggle(): void } | null;
    };
    Dropdown: {
      getInstance(element: Element): { toggle(): void } | null;
    };
    Modal: {
      getInstance(element: Element): { show(): void; hide(): void } | null;
    };
    Popover: {
      getInstance(element: Element): { show(): void; hide(): void } | null;
    };
    ScrollSpy: {
      getInstance(element: Element): { refresh(): void } | null;
    };
    Tab: {
      getInstance(element: Element): { show(): void } | null;
    };
    Toast: {
      getInstance(element: Element): { show(): void; hide(): void } | null;
    };
    Tooltip: {
      getInstance(element: Element): { show(): void; hide(): void } | null;
    };
  }

  const bootstrap: Bootstrap;
  export default bootstrap;
} 