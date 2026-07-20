/* eslint-disable react/no-danger */
/* eslint-disable @next/next/next-script-for-ga */
/* eslint-disable react/self-closing-comp */
import * as React from 'react'
import Document, { Html, Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          {/* PWA primary color */}
          <meta name="theme-color" content="#4200FF" />
          <link rel="shortcut icon" href="/favicon.ico" />
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-MF93SZM');`,
            }}
          ></script>
        </Head>
        <body>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{
              display: 'none',
            }}
            alt=""
            src="https://px.ads.linkedin.com/collect/?pid=4006001&fmt=gif"
          />
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
