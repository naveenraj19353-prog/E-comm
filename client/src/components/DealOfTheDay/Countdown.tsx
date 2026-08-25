import { useEffect, useState } from "react";
import styles from "./Countdown.module.css";
const Countdown = () => {
    const [time, setTime] = useState(() => {
        const target = new Date();
        target.setHours(target.getHours() + 18);
        return target.getTime() - Date.now();
    });
    useEffect(() => {
        const timer = window.setInterval(() => {
            setTime((previous) => Math.max(previous - 1000, 0));
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);
    const totalSeconds = Math.floor(time / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return (<div className={styles.timer}>
      <div>
        <span>{String(hours).padStart(2, "0")}</span>
        <small>Hours</small>
      </div>
      <div>
        <span>{String(minutes).padStart(2, "0")}</span>
        <small>Min</small>
      </div>
      <div>
        <span>{String(seconds).padStart(2, "0")}</span>
        <small>Sec</small>
      </div>
    </div>);
};
export default Countdown;
