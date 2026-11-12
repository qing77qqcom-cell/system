<template>
  <!-- form表单 -->
  <form ref="vni" @submit.prevent="submitForm" validate>
    <!-- 账号 -->
    <label :class="{ 'is-invalid': isInvalid }">
      <span aria-hidden="true">
        <!-- 图标 -->
        <svg viewbox="0 0 24 24">
          <path d="M12 2l-8 4.5 8 4.5z" />
          <circle cx="12" cy="12" r="10" />
        </svg>



      </span>
      <input
      type="text"
      v-model="username"
      placeholder="请输入账号"
       @input="handleBlur"
        @blur="handleBlur" />
        <button type="button">
          <svg></svg>
        </button>


    </label>
    <!-- 密码 -->
     <label >
      <span>
        <svg></svg>
      </span>
      <input type="password" v-model="password" placeholder="请输入密码">
      <button type="button">
        <template v-if="isShowPassword">
          <svg></svg>
        </template>
        <template v-else>
          <svg></svg>
        </template>
      </button>
     </label>
     <!-- 记住我 -->
      <label>
        <input type="checkbox" v-model="isRememberMe">
        <span>

          <svg></svg>
        </span>
      </label>
  </form>

  <!-- asidebars -->
<nav>
  <ul>
    <li v-for="item in items" :key="item.id">
      <div v-if="colsw">
        <span></span>
        <span>{{ item.name }}</span>
      </div>
      <details v-else>
        <summary>
          <span></span>
        <span>{{ item.name }}</span>
        </summary>
        <asidebars :items="item.children" />
      </details>
    </li>


  </ul>
</nav>

<!-- userlist -->

</template>
