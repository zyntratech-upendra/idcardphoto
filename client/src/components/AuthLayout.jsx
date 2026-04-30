import { Link } from "react-router-dom";

const AuthLayout = ({ title, subtitle, actionText, actionLink, actionHref, children }) => (
  <div className="min-h-screen bg-gradient-to-br from-sky-100 via-cyan-50 to-emerald-100 p-6">
    <div className="mx-auto flex min-h-[90vh] max-w-5xl items-center justify-center">
      <div className="grid w-full overflow-hidden rounded-2xl bg-white shadow-xl lg:grid-cols-2">
        <div className="hidden bg-ink p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-sky-300">ID Card Studio</p>
            <h1 className="text-4xl font-semibold leading-tight">Design, map data, and export cards in minutes.</h1>
          </div>
          <p className="text-sm text-slate-300">
            College admin workspace for template creation, student onboarding, and bulk ID generation.
          </p>
        </div>
        <div className="p-8 sm:p-10">
          <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {actionText && actionLink && actionHref && (
            <p className="mt-8 text-sm text-slate-600">
              {actionText}{" "}
              <Link className="font-medium text-sky-600 hover:text-sky-500" to={actionHref}>
                {actionLink}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  </div>
);

export default AuthLayout;
