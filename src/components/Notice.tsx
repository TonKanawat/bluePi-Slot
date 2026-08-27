interface Props {
  title: string;
  children?: React.ReactNode;
  tone?: 'info' | 'warn';
  action?: React.ReactNode;
}

/** Full-page message for the states that are not the game: not connected, not
 *  registered, not configured yet. */
export function Notice({ title, children, tone = 'info', action }: Props) {
  return (
    <div className="auth">
      <div className="auth-card" data-tone={tone}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">bluePi Slot</span>
        </div>
        <h1 className="auth-title">{title}</h1>
        <div className="auth-sub">{children}</div>
        {action && <div className="notice-action">{action}</div>}
      </div>
    </div>
  );
}
