import React, { useEffect, useState } from 'react'
import Image from 'next/legacy/image'
import Link from 'next/link'
import Logo from '../../assets/rebranding/logo_black.svg'
import { scrollToSection } from '../../utilities/helpers'
import MainHeaderMobile from './MainHeaderMobile'
import { useRouter, usePathname } from 'next/navigation'
import styles from './styles.module.css'
import { createClient } from '../../lib/supabase-browser'

const BUTTONS = [
  {
    id: 'btn_0',
    label: 'Get your AI Agent',
    path: 'https://api.leadconnectorhq.com/widget/bookings/strategy-call-with-lyrisesivto9',
  },
]

const NAVIGATIONS = [
  {
    id: 'nav_1',
    label: 'Our Blog',
    path: 'https://blog.lyrise.ai/',
    isPage: false,
  },
]

export default function MainHeader({ user = null }) {
  const router = useRouter()

  const handleSignOut = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    window.location.href = '/'
  }

  const navigate = (path) => {
    router.push(path)
  }

  const pathname = usePathname()
  const isRoiPage =
    pathname === '/roi-report' || pathname?.startsWith('/report/')

  const [isClient, setIsClient] = useState(false)
  const [isEmployee, setIsEmployee] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      const employee = user?.email?.endsWith('@lyrise.ai') ?? false
      setIsClient(!!user && !employee)
      setIsEmployee(employee)
    })
  }, [])

  return (
    <header className="px-2 py-4 mt-3 mb-10 sm:px-10 lg:mb-0">
      <div
        className={`custom-container px-[1rem] sm:px[2.5rem] flex items-center justify-between gap-4 py-3 ${styles.navbar}`}
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

        <ul className="items-center hidden gap-10 font-normal lg:flex font-outfit text-new-black">
          {NAVIGATIONS.map(({ label, path, isPage }) => (
            <li key={path}>
              <div
                onClick={() => {
                  if (isPage) {
                    navigate(path)
                  } else {
                    scrollToSection(path)
                  }
                }}
                className={`text-[20px] font-[600] leading-[19.2px] inline-block relative after:absolute after:start-1/2 after:-translate-x-1/2 after:bottom-[1px] after:h-[1px] after:w-full after:transition-transform after:scale-0 hover:after:scale-100 after:rounded-full cursor-pointer font-outfit ${
                  label === 'AI Accelerator'
                    ? 'text-[#DE0000] after:bg-[#DE0000] '
                    : 'text-new-black after:bg-new-black '
                }`}
              >
                {label}
              </div>
            </li>
          ))}
        </ul>

        <div className="items-center hidden gap-4 lg:flex">
          {isClient && isRoiPage && (
            <Link
              href="/dashboard"
              className="font-outfit text-[16px] font-[600] text-new-black hover:opacity-70 transition-opacity"
            >
              My Reports
            </Link>
          )}
          {isEmployee && isRoiPage && (
            <Link
              href="/dashboard"
              className="font-outfit text-[16px] font-[600] text-new-black hover:opacity-70 transition-opacity"
            >
              ← Dashboard
            </Link>
          )}

          {isClient || isEmployee ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="cursor-pointer text-[18px] font-[500] flex items-center justify-center gap-2 p-2 px-5 leading-[24px] rounded-[30px] text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors font-outfit"
            >
              Sign out
            </button>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="cursor-pointer text-[18px] font-[500] flex items-center justify-center gap-2 p-2 px-5 leading-[24px] rounded-[30px] text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors font-outfit"
              >
                Log in
              </Link>
            </>
          )}
        </div>

        <MainHeaderMobile navigation={NAVIGATIONS} buttons={BUTTONS} />
      </div>
    </header>
  )
}
