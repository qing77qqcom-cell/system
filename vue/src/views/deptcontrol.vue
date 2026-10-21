<template>
  <div>
    <h1 :title="title"> {{ title }}</h1>
    <img :src="pic" alt="组织架构" class="pic" />

  </div>
</template>
<script setup>

import pic from '@/assets/offcampus.jpg'



defineProps({
  title: {
    type: String,
    default: '组织架构',
  },
})


</script>
<style scoped>
.pic {
  width: 70%;
  height: auto;
  object-fit: contain;
}
</style>
