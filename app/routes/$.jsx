import ErrorPage from "../components/ErrorPage";

export default function NotFound() {
  return (
    <ErrorPage
      title="Page Not Found"
      subtitle="The page you're looking for doesn't exist or has been moved."
    />
  );
}
