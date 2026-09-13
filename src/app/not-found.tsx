export default function NotFound() {
  return (
    <div className='flex min-h-[60vh] items-center justify-center'>
      <div className='text-center'>
        <h1 className="ds-title ds-label ds-text ds-after-control">Page not found</h1>
        <p className='ds-muted'>The page you are looking for does not exist.</p>
      </div>
    </div>
  );
}
