import { useEffect, useState } from "react";
import styles from "./Countdown.module.css";

const targetDate = new Date();
targetDate.setHours(targetDate.getHours() + 18);

const Countdown = () => {

  const [time,setTime]=useState(0);

  useEffect(()=>{

    const timer=setInterval(()=>{

      setTime(targetDate.getTime()-Date.now());

    },1000);

    return ()=>clearInterval(timer);

  },[]);

  const hours=Math.floor(time/(1000*60*60));

  const minutes=Math.floor((time/(1000*60))%60);

  const seconds=Math.floor((time/1000)%60);

  return(

<div className={styles.timer}>

<div>

<span>{hours}</span>

<small>Hours</small>

</div>

<div>

<span>{minutes}</span>

<small>Min</small>

</div>

<div>

<span>{seconds}</span>

<small>Sec</small>

</div>

</div>

)

};

export default Countdown;