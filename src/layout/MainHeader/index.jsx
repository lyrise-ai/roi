import Image from 'next/legacy/image'
import Link from 'next/link'
import Logo from '../../assets/rebranding/logo_black.svg'
import { useRouter } from 'next/router'
import styles from './styles.module.css'
import { useAuthSession } from '../../context/AuthSessionContext'

export default function MainHeader() {
  const router = useRouter()

  const handleSignOut = () => {
    // Optimistic: leave the page immediately via client-side navigation and
    // let the logout request clear the session cookie in the background —
    // the user is navigating away regardless of its result.
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    router.push('/')
  }

  const pathname = router.asPath?.split(/[?#]/)[0] ?? router.pathname
  const isRoiPage =
    pathname === '/roi-report' || pathname?.startsWith('/report/')

  const { user } = useAuthSession()
  const isEmployee = user?.email?.endsWith('@lyrise.ai') ?? false
  const isClient = !!user && !isEmployee

  return (
    <header className="px-2 py-4 mt-3 mb-10 sm:px-10 lg:mb-0">
      <div
        className={`px-[1rem] sm:px[2.5rem] flex items-center justify-between gap-4 py-3 ${styles.navbar}`}
      >
        <Link href="/" title="LyRise" className="h-[36px]">
          <Image
            src={Logo}
            alt="LyRise AI"
            width={120}
            height={40}
            objectFit="contain"
          />
        </Link>
        <div className="items-center hidden gap-4 lg:flex">
          {isClient && isRoiPage && (
            <Link
              href="/dashboard"
              className="text-[16px] font-[600] text-new-black hover:opacity-70 transition-opacity"
            >
              My Reports
            </Link>
          )}
          {isEmployee && isRoiPage && (
            <Link
              href="/dashboard"
              className="text-[16px] font-[600] text-new-black hover:opacity-70 transition-opacity"
            >
              ← Dashboard
            </Link>
          )}

          {isClient || isEmployee ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="cursor-pointer text-[18px] font-[500] flex items-center justify-center gap-2 p-2 px-5 leading-[24px] rounded-[30px] text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="cursor-pointer text-[18px] font-[500] flex items-center justify-center gap-2 p-2 px-5 leading-[24px] rounded-[30px] text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Log in
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
