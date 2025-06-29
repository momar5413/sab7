let btn = document.getElementsByTagName("button")[0];
let text = document.getElementsByTagName("div")[0];
let title = document.getElementsByTagName("h1")[0];
let data = ["سبحان الله","الحمدلله","الله اكبر","لا اله الا الله وحده لا شريك له الملك وله الحمد وهو على كل شيء قدير"];
let counter = 0 ;
btn.onclick =() =>{
    counter++;
    text.innerHTML = counter ;
    if (counter <= 33){
        title.innerHTML = data[0];
    } else if (counter <=66 && counter >=33 ){
        title.innerHTML = data[1];
    } else if (counter>=66 && counter<=99){
        title.innerHTML = data[2];
    } else if (counter===100){
        title.innerHTML = data[3];
    }else{
        counter = 0 ;
    }
}