import { Menu as MenuIcon } from '@mui/icons-material'
import { Drawer, IconButton } from '@mui/material'
import { useState } from 'react'
import logo from '../../assets/rebranding/logo_black.svg'
import Image from 'next/legacy/image'
import CloseIcon from '@mui/icons-material/Close'
import { useRouter } from 'next/navigation'
import { scrollToSection } from '../../utilities/helpers'

const MainHeaderMobile = ({ navigation, buttons }) => {
  const [isOpen, setIsOpen] = useState(false)

  const toggleDrawer = (open) => (event) => {
    if (
      event.type === 'keydown' &&
      (event.key === 'Tab' || event.key === 'Shift')
    ) {
      return
    }
    setIsOpen(open)
  }

  const router = useRouter()
  const navigate = (path) => {
    router.push(path)
  }

  return (
    <div className="block lg:hidden">
      <IconButton
        onClick={toggleDrawer(true)}
        className="relative z-100 flex items-center justify-center w-10 h-10 rounded-lg bg-new-black"
        aria-label="Open menu"
      >
        <MenuIcon className="size-8 text-white" />
      </IconButton>
      <Drawer
        anchor="left"
        open={isOpen}
        onClose={toggleDrawer(false)}
        PaperProps={{
          sx: {
            backgroundColor: '#f8f8f8',
            width: '75%',
            maxWidth: '24rem',
          },
        }}
      >
        <div className="flex flex-col h-full p-6">
          <div className="space-y-2">
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">
                  <Image src={logo} alt="Lyrise AI" className="w-28" />
                </div>
                <IconButton
                  onClick={toggleDrawer(false)}
                  aria-label="Close menu"
                  size="small"
                  sx={{ padding: 0 }}
                >
                  <CloseIcon className="size-8 text-new-black" />
                </IconButton>{' '}
              </div>
              <div className="text-[16px] leading-[120%] text-new-black">
                Unlock $300K-$1M Hidden in Your Legal & Finance Operations.
              </div>
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-0 font-space-grotesk font-normal text-new-black">
            {navigation.map(({ id, label, path, isPage }) => (
              <li key={id}>
                <div
                  onClick={() => {
                    if (isPage) {
                      navigate(path)
                    } else {
                      scrollToSection(path)
                    }
                    toggleDrawer(false)
                  }}
                  className={`text-[16px] inline-block relative after:absolute after:start-1/2 after:-translate-x-1/2 after:bottom-[1px] after:h-[1px] after:w-full after:transition-transform after:scale-0 hover:after:scale-100 after:rounded-full after:bg-new-black ${
                    label === 'AI Accelerator'
                      ? 'text-[#DE0000] after:bg-[#DE0000]'
                      : 'text-new-black after:bg-new-black'
                  }`}
                >
                  {label}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex-1 flex flex-row items-end justify-start" />
        </div>
      </Drawer>
    </div>
  )
}

export default MainHeaderMobile
