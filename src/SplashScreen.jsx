import React from 'react';
import Lottie from 'lottie-react';
import logoAnimation from './assets/logo_animation.json';
import loadingBarAnimation from './assets/Loading Bar.json';

const SplashScreen = () => {
  return (
    <div style={styles.container}>
      <div style={styles.content}>

        {/* Logo Lottie Animation */}
        <div style={styles.logoWrapper}>
          <Lottie
            animationData={logoAnimation}
            loop={false}
            autoplay={true}
            style={styles.lottie}
          />
        </div>

        {/* Loading Bar Lottie Animation */}
        <div style={styles.loadingBarWrapper}>
          <Lottie
            animationData={loadingBarAnimation}
            loop={true}
            autoplay={true}
            style={styles.loadingBarLottie}
          />
        </div>

      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    width: '100vw',
    background: '#ffffff',
    margin: 0,
    padding: 0,
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 9999,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0px',
  },
  logoWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottie: {
    width: '360px',
    height: '360px',
  },
  loadingBarWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: '-110px',
  },
  loadingBarLottie: {
    width: '140px',
    height: '36px',
  },
};

export default SplashScreen;
