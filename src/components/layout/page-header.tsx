type PageHeaderProps = {
  area: string;
  title: string;
  description: string;
  action?: React.ReactNode;
};

export function PageHeader({ area, title, description, action }: PageHeaderProps) {
  return (
    <>
      <div className="breadcrumb">{area}</div>
      <div className="page-title">
        <div>
          <h1>{title}</h1>
          <p className="muted">{description}</p>
        </div>
        {action}
      </div>
    </>
  );
}
